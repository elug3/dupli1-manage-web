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

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function exchangeRefreshToken(
  refreshToken: string
): Promise<{ accessToken: string } | null> {
  const res = await backendPost("auth", "/api/v1/auth/refresh", {
    refresh_token: refreshToken,
  });
  if (!res.ok) return null;
  const body = (await res.json()) as RefreshResponse;
  return { accessToken: body.token };
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

function cacheAccessToken(sessionId: string, accessToken: string): void {
  const expiresAt = jwtExpiryMs(accessToken);
  setCachedAccessToken(
    sessionId,
    accessToken,
    (expiresAt ?? Date.now()) - ACCESS_TOKEN_REFRESH_SKEW_MS
  );
}

/**
 * Exchange the session's refresh token for an access token, reusing a cached
 * one while it's fresh. Pass `forceRefresh` after an upstream 401 (or for
 * `/auth/session/refresh`) so we don't hand back the same rejected token.
 */
async function cachedAccessTokenExchange(
  sessionId: string,
  refreshToken: string,
  options: { forceRefresh?: boolean } = {}
): Promise<{ accessToken: string } | null> {
  if (options.forceRefresh) {
    clearCachedAccessToken(sessionId);
  } else {
    const cached = getCachedAccessToken(sessionId);
    if (cached) return { accessToken: cached };
  }

  const exchanged = await exchangeRefreshToken(refreshToken);
  if (!exchanged) return null;

  cacheAccessToken(sessionId, exchanged.accessToken);
  return exchanged;
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
  if (!exchanged) {
    return jsonResponse({ error: "Failed to establish session" }, { status: 502 });
  }

  const profile =
    (await fetchAuthProfile(exchanged.accessToken)) ?? {
      user_id: "",
      email,
      account_type: "customer",
      permissions: [],
    };

  const sessionId = createSession(
    refresh_token,
    profile.email || email,
    profile.user_id,
    profile.permissions ?? [],
    normalizeSessionAccountType(profile.account_type)
  );
  cacheAccessToken(sessionId, exchanged.accessToken);

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
    const refreshToken = getRefreshToken(sessionId);
    if (refreshToken) {
      await backendPost("auth", "/api/v1/auth/logout", {
        refresh_token: refreshToken,
      }).catch(() => {});
    }
    deleteSession(sessionId);
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

  const session = getSession(sessionId);
  if (!session) {
    return jsonResponse({ error: "Session expired" }, {
      status: 401,
      headers: { "Set-Cookie": clearSessionCookieHeader(request) },
    });
  }

  // Access token may be stale; exchange via refresh_token (or reuse cache).
  // If refresh fails the session is no longer usable — clear cookie.
  const exchanged = await cachedAccessTokenExchange(
    sessionId,
    session.refreshToken
  );
  if (!exchanged) {
    deleteSession(sessionId);
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

async function accessTokenFromSession(
  request: Request,
  options: { forceRefresh?: boolean } = {}
): Promise<{ accessToken: string } | Response> {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return jsonResponse({ error: "Not authenticated" }, { status: 401 });
  }

  const refreshToken = getRefreshToken(sessionId);
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
  if (!exchanged) {
    deleteSession(sessionId);
    return jsonResponse({ error: "Session expired" }, {
      status: 401,
      headers: { "Set-Cookie": clearSessionCookieHeader(request) },
    });
  }

  return exchanged;
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
