import { backendGet, backendPost, serviceUrl } from "./backend";
import {
  gatewayRelativePath,
  proxyGatewayRequestForPath,
} from "./gateway-proxy";
import {
  clearSessionCookieHeader,
  getSessionId,
  setSessionCookieHeader,
} from "./session-cookie";
import {
  clearCachedAccessToken,
  commitTokenExchange,
  createSession,
  deleteSession,
  getCachedAccessToken,
  getRefreshToken,
  getSession,
  setCachedAccessToken,
} from "./session-store";
import { AUTH_PREFIX } from "../gateway";

interface LoginResponse {
  refresh_token: string;
}

interface RefreshResponse {
  token: string;
  /** Auth rotates on every exchange and returns the replacement here. */
  refresh_token?: string;
}

interface AuthMeResponse {
  user_id: string;
  email: string;
  account_type?: string;
  permissions?: string[];
}

/** Auth still stores human operators as `admin`; manage-web displays `manager`. */
function normalizeSessionAccountType(value: string | undefined): string {
  if (value === "admin") return "manager";
  return value || "customer";
}

function jsonResponse(
  body: unknown,
  init: ResponseInit = {}
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

/**
 * Auth could not be reached, so the session's standing is unknown.
 *
 * Deliberately not a 401: the cookie stays, the stored session stays, and the
 * browser is told to retry. `code` lets the client distinguish this from a
 * real sign-out without parsing prose.
 */
function unavailableResponse(): Response {
  return jsonResponse(
    { error: "Auth service unavailable", code: "auth_unavailable" },
    { status: 503, headers: { "Retry-After": "2" } }
  );
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * What an exchange attempt actually established.
 *
 * `rejected` is auth's verdict on the token: spent, revoked, expired, or the
 * account is gone. The session is over and the cookie should go.
 *
 * `unavailable` means we never got a verdict — auth is down, its session
 * ledger is unreachable, the gateway timed out. The token is probably fine,
 * so the session must survive. Conflating the two is what made a few seconds
 * of Redis downtime sign out every operator: auth's session ledger lives in
 * Redis, and the task is replaced stop-before-start on every deploy.
 */
type ExchangeResult =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; reason: "rejected" | "unavailable" };

/**
 * Exchange a refresh token for an access token, returning the refresh token to
 * store next.
 *
 * Auth rotates: the token just spent is dead the moment this returns, and the
 * replacement arrives in the response. Whoever calls this **must** persist the
 * returned `refreshToken`, or the session is left holding a token auth will
 * reject and the next exchange logs the operator out.
 *
 * Falls back to the token we sent if the response omits a replacement, so an
 * auth build that does not rotate keeps working.
 */
async function exchangeRefreshToken(
  refreshToken: string
): Promise<ExchangeResult> {
  let res: Response;
  try {
    res = await backendPost("auth", "/api/v1/auth/refresh", {
      refresh_token: refreshToken,
    });
  } catch {
    // Never reached auth. We know nothing about the token.
    return { ok: false, reason: "unavailable" };
  }

  if (!res.ok) {
    // 401 is auth rejecting the token; 403 is a locked or deactivated
    // account. Anything else — 503 when auth cannot reach its own session
    // store, 502 from the gateway, 429 — is about auth, not the token.
    const rejected = res.status === 401 || res.status === 403;
    return { ok: false, reason: rejected ? "rejected" : "unavailable" };
  }

  let body: RefreshResponse;
  try {
    body = (await res.json()) as RefreshResponse;
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (!body.token) return { ok: false, reason: "unavailable" };

  return {
    ok: true,
    accessToken: body.token,
    refreshToken: body.refresh_token?.trim() || refreshToken,
  };
}

/** Refresh this long before the JWT's actual `exp` to absorb request latency and clock drift. */
const ACCESS_TOKEN_REFRESH_SKEW_MS = 30_000;

/** Read `exp` (seconds) from an unverified JWT payload; the gateway still verifies the signature. */
function jwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number;
    };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** When a cached access token should stop being handed out. */
function accessTokenExpiry(accessToken: string): number {
  const expiresAt = jwtExpiryMs(accessToken);
  return (expiresAt ?? Date.now()) - ACCESS_TOKEN_REFRESH_SKEW_MS;
}

/**
 * One in-flight exchange per session.
 *
 * Rotation makes a concurrent second exchange fail: two parallel API calls that
 * both miss the cache would spend the same token, and the loser's 401 would
 * tear down a session that is perfectly healthy. Joiners share the winner's
 * result instead.
 */
const exchangesInFlight = new Map<
  string,
  Promise<CachedExchangeResult>
>();

/** As ExchangeResult, minus the rotated token the caller has already stored. */
type CachedExchangeResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "rejected" | "unavailable" };

/**
 * Exchange the session's refresh token for an access token, reusing a cached
 * one while it's fresh. Pass `forceRefresh` after an upstream 401 (or for
 * `/auth/session/refresh`) so we don't hand back the same rejected token.
 *
 * `refreshToken` must be read from the store immediately before calling, since
 * each exchange rotates it.
 */
async function cachedAccessTokenExchange(
  sessionId: string,
  refreshToken: string,
  options: { forceRefresh?: boolean } = {}
): Promise<CachedExchangeResult> {
  if (options.forceRefresh) {
    await clearCachedAccessToken(sessionId);
  } else {
    const cached = await getCachedAccessToken(sessionId);
    if (cached) return { ok: true, accessToken: cached };
  }

  const joined = exchangesInFlight.get(sessionId);
  if (joined) return joined;

  const exchange = (async (): Promise<CachedExchangeResult> => {
    const exchanged = await exchangeRefreshToken(refreshToken);
    if (exchanged.ok) {
      await commitTokenExchange(
        sessionId,
        exchanged.refreshToken,
        exchanged.accessToken,
        accessTokenExpiry(exchanged.accessToken)
      );
      return { ok: true, accessToken: exchanged.accessToken };
    }

    // Auth never answered, so the token is not known to be bad. Say so and
    // leave the session alone; retrying against the store would only read the
    // same token back and ask the same unreachable service again.
    if (exchanged.reason === "unavailable") {
      return { ok: false, reason: "unavailable" };
    }

    // Auth rejected our token. With a shared store that does not prove the
    // session is dead: another task may have rotated it between our read and
    // our call, which invalidates ours while the session stays healthy.
    // In-process coalescing cannot see that, so check the store before giving
    // up — otherwise one unlucky race logs the operator out.
    const current = await getSession(sessionId);
    if (!current || current.refreshToken === refreshToken) {
      // Unchanged: the token really is spent or revoked.
      return { ok: false, reason: "rejected" };
    }

    const fresh = await getCachedAccessToken(sessionId);
    if (fresh) return { ok: true, accessToken: fresh };

    const retried = await exchangeRefreshToken(current.refreshToken);
    if (!retried.ok) return { ok: false, reason: retried.reason };
    await commitTokenExchange(
      sessionId,
      retried.refreshToken,
      retried.accessToken,
      accessTokenExpiry(retried.accessToken)
    );
    return { ok: true, accessToken: retried.accessToken };
  })();

  exchangesInFlight.set(sessionId, exchange);
  try {
    return await exchange;
  } finally {
    exchangesInFlight.delete(sessionId);
  }
}

async function fetchAuthProfile(
  accessToken: string
): Promise<AuthMeResponse | null> {
  const res = await backendGet("auth", "/api/v1/auth/me", accessToken);
  if (!res.ok) return null;
  return res.json() as Promise<AuthMeResponse>;
}

export async function handleSessionLogin(request: Request): Promise<Response> {
  let email: string;
  let password: string;

  try {
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return jsonResponse({ error: "Email and password are required" }, {
        status: 400,
      });
    }
    email = body.email;
    password = body.password;
  } catch {
    return jsonResponse({ error: "Invalid request body" }, { status: 400 });
  }

  const res = await backendPost("auth", "/api/v1/auth/login", { email, password });
  if (!res.ok) {
    return jsonResponse(
      { error: await readError(res, "Login failed") },
      { status: res.status }
    );
  }

  const { refresh_token } = (await res.json()) as LoginResponse;
  const exchanged = await exchangeRefreshToken(refresh_token);
  if (!exchanged.ok) {
    // Login just succeeded, so a rejection here means auth contradicted
    // itself; unavailable means it went away between the two calls. Either
    // way there is no session yet to preserve — only the status differs, so
    // the browser can tell "try again" from "something is wrong".
    return exchanged.reason === "unavailable"
      ? jsonResponse({ error: "Auth service unavailable" }, { status: 503 })
      : jsonResponse({ error: "Failed to establish session" }, { status: 502 });
  }

  const profile =
    (await fetchAuthProfile(exchanged.accessToken)) ?? {
      user_id: "",
      email,
      account_type: "customer",
      permissions: [],
    };

  // exchanged.refreshToken, not refresh_token: the exchange above already spent
  // the one auth handed us at login, so storing it would start the session on a
  // dead token.
  const sessionId = await createSession(
    exchanged.refreshToken,
    profile.email || email,
    profile.user_id,
    profile.permissions ?? [],
    normalizeSessionAccountType(profile.account_type)
  );
  await setCachedAccessToken(
    sessionId,
    exchanged.accessToken,
    accessTokenExpiry(exchanged.accessToken)
  );

  return jsonResponse(
    { email },
    { headers: { "Set-Cookie": setSessionCookieHeader(sessionId, request) } }
  );
}

export async function handleSessionRefresh(request: Request): Promise<Response> {
  // Always hit auth refresh — callers only reach this after a 401, so a cached
  // access token is exactly what just failed upstream.
  const tokenResult = await accessTokenFromSession(request, {
    forceRefresh: true,
  });
  if (tokenResult instanceof Response) return tokenResult;
  return jsonResponse({ access_token: tokenResult.accessToken });
}

export async function handleSessionLogout(request: Request): Promise<Response> {
  const sessionId = getSessionId(request);
  if (sessionId) {
    const refreshToken = await getRefreshToken(sessionId);
    if (refreshToken) {
      await backendPost("auth", "/api/v1/auth/logout", {
        refresh_token: refreshToken,
      }).catch(() => {});
    }
    await deleteSession(sessionId);
  }

  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearSessionCookieHeader(request) },
  });
}

export async function handleSessionMe(request: Request): Promise<Response> {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return jsonResponse({ error: "No session" }, { status: 401 });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return jsonResponse({ error: "Session expired" }, {
      status: 401,
      headers: { "Set-Cookie": clearSessionCookieHeader(request) },
    });
  }

  // Access token may be stale; exchange via refresh_token (or reuse cache).
  // Only auth's own verdict ends the session — see ExchangeResult.
  const exchanged = await cachedAccessTokenExchange(
    sessionId,
    session.refreshToken
  );
  if (!exchanged.ok) {
    if (exchanged.reason === "unavailable") {
      return unavailableResponse();
    }
    await deleteSession(sessionId);
    return jsonResponse({ error: "Session expired" }, {
      status: 401,
      headers: { "Set-Cookie": clearSessionCookieHeader(request) },
    });
  }

  return jsonResponse({
    email: session.email,
    user_id: session.userId,
    permissions: session.permissions,
    account_type: session.accountType,
  });
}

/** Server-side register proxy using the signed-in admin's session. */
export async function handleSessionRegister(
  request: Request
): Promise<Response> {
  const tokenResult = await accessTokenFromSession(request);
  if (tokenResult instanceof Response) return tokenResult;

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return jsonResponse({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return jsonResponse({ error: "Email and password are required" }, {
      status: 400,
    });
  }

  const res = await fetch(serviceUrl("auth", "/api/v1/auth/register"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenResult.accessToken}`,
    },
    body: JSON.stringify({ email: body.email, password: body.password }),
  });

  if (!res.ok) {
    return jsonResponse(
      { error: await readError(res, "Failed to register user") },
      { status: res.status }
    );
  }

  const data = (await res.json()) as { user_id: string };
  return jsonResponse({ user_id: data.user_id }, { status: 201 });
}

/**
 * Resolve a short-lived access token from the httpOnly session cookie.
 * Returns a JSON 401 Response when the session is missing/expired.
 * Used by the session gateway proxy and SSR page loaders/actions.
 */
export async function accessTokenFromSession(
  request: Request,
  options: { forceRefresh?: boolean } = {}
): Promise<{ accessToken: string } | Response> {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return jsonResponse({ error: "Not authenticated" }, { status: 401 });
  }

  const refreshToken = await getRefreshToken(sessionId);
  if (!refreshToken) {
    return jsonResponse({ error: "Session expired" }, {
      status: 401,
      headers: { "Set-Cookie": clearSessionCookieHeader(request) },
    });
  }

  const exchanged = await cachedAccessTokenExchange(
    sessionId,
    refreshToken,
    options
  );
  if (!exchanged.ok) {
    // Auth is unreachable rather than refusing us: keep the session and the
    // cookie. A 503 tells the browser to back off and retry, where a 401
    // would send it to /login and destroy a session that is perfectly good.
    if (exchanged.reason === "unavailable") {
      return unavailableResponse();
    }
    await deleteSession(sessionId);
    return jsonResponse({ error: "Session expired" }, {
      status: 401,
      headers: { "Set-Cookie": clearSessionCookieHeader(request) },
    });
  }

  return { accessToken: exchanged.accessToken };
}

/** Browser gateway prefixes that hit the auth service (source of truth for login). */
function isAuthGatewayPath(gatewayPathname: string): boolean {
  return (
    gatewayPathname === AUTH_PREFIX ||
    gatewayPathname.startsWith(`${AUTH_PREFIX}/`)
  );
}

/**
 * Proxy gateway API calls using a fresh access token from the signed-in session.
 * Avoids stale or missing browser tokens when calling product/auth/order APIs.
 *
 * Auth is the source of truth for login state (same policy as dupli1-web):
 * a non-auth upstream 401 triggers one forced refresh + retry. If auth refresh
 * fails the session is cleared (real logout). If refresh succeeds but the
 * upstream still rejects, return 502 so the browser does not bounce to /login.
 */
export async function handleSessionGatewayProxy(
  request: Request
): Promise<Response> {
  const url = new URL(request.url);
  const gatewayPathname = url.pathname.replace(/^\/auth\/session\/gateway/, "");
  if (!gatewayPathname || gatewayPathname === url.pathname) {
    return jsonResponse({ error: "Not found" }, { status: 404 });
  }

  if (!gatewayRelativePath(gatewayPathname)) {
    return jsonResponse({ error: "Not found" }, { status: 404 });
  }

  const tokenResult = await accessTokenFromSession(request);
  if (tokenResult instanceof Response) {
    return tokenResult;
  }

  // Buffer once so a post-refresh retry can resend the same payload.
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  let upstream = await proxyGatewayRequestForPath(
    request,
    gatewayPathname,
    tokenResult.accessToken,
    body
  );

  if (upstream.status !== 401 || isAuthGatewayPath(gatewayPathname)) {
    return upstream;
  }

  // Non-auth upstream rejected the token — force a refresh handshake once.
  const refreshed = await accessTokenFromSession(request, {
    forceRefresh: true,
  });
  if (refreshed instanceof Response) {
    return refreshed;
  }

  upstream = await proxyGatewayRequestForPath(
    request,
    gatewayPathname,
    refreshed.accessToken,
    body
  );

  if (upstream.status !== 401) {
    return upstream;
  }

  // Session is still valid per auth; the upstream rejected the token
  // (JWKS mismatch, misconfig, outage). Do not log the user out.
  return jsonResponse(
    {
      error: "Upstream rejected a valid session token",
      code: "upstream_unauthorized",
    },
    { status: 502 }
  );
}
