import { backendPost } from "./backend";
import {
  clearSessionCookieHeader,
  getSessionId,
  setSessionCookieHeader,
} from "./session-cookie";
import {
  createSession,
  deleteSession,
  getRefreshToken,
  getSession,
} from "./session-store";

interface LoginResponse {
  refresh_token: string;
}

interface RefreshResponse {
  token: string;
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

  const sessionId = createSession(refresh_token, email);

  return jsonResponse(
    { access_token: exchanged.accessToken, email },
    { headers: { "Set-Cookie": setSessionCookieHeader(sessionId, request) } }
  );
}

export async function handleSessionRefresh(request: Request): Promise<Response> {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return jsonResponse({ error: "No session" }, { status: 401 });
  }

  const refreshToken = getRefreshToken(sessionId);
  if (!refreshToken) {
    return jsonResponse({ error: "Session expired" }, {
      status: 401,
      headers: { "Set-Cookie": clearSessionCookieHeader(request) },
    });
  }

  const exchanged = await exchangeRefreshToken(refreshToken);
  if (!exchanged) {
    deleteSession(sessionId);
    return jsonResponse({ error: "Session expired" }, {
      status: 401,
      headers: { "Set-Cookie": clearSessionCookieHeader(request) },
    });
  }

  return jsonResponse({ access_token: exchanged.accessToken });
}

export async function handleSessionLogout(request: Request): Promise<Response> {
  const sessionId = getSessionId(request);
  if (sessionId) {
    await backendPost("auth", "/api/v1/auth/logout").catch(() => {});
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

  return jsonResponse({ email: session.email });
}
