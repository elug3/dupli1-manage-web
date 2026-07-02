export interface User {
  id: string;
  email: string;
  role?: string;
}

interface AccessTokenResponse {
  access_token: string;
  email?: string;
}

const SESSION_FETCH: RequestInit = { credentials: "include" };

function post(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    ...SESSION_FETCH,
  });
}

function readAccessToken(): string | null {
  try {
    return localStorage.getItem("dupli1_at");
  } catch {
    return null;
  }
}

function storeAccessToken(accessToken: string): void {
  localStorage.setItem("dupli1_at", accessToken);
}

export function clearTokens(): void {
  try {
    localStorage.removeItem("dupli1_at");
    localStorage.removeItem("dupli1_rt");
  } catch {
    // no-op in SSR
  }
}

async function tryRefresh(): Promise<boolean> {
  const res = await post("/auth/session/refresh");
  if (!res.ok) {
    clearTokens();
    return false;
  }
  const body = (await res.json()) as AccessTokenResponse;
  storeAccessToken(body.access_token);
  return true;
}

export async function getMe(): Promise<User | null> {
  const accessToken = readAccessToken();
  if (!accessToken) {
    if (await tryRefresh()) return getMe();
    return null;
  }

  const res = await fetch("/auth/session/me", SESSION_FETCH);

  if (res.status === 401) {
    if (await tryRefresh()) return getMe();
    return null;
  }

  if (!res.ok) return null;
  const body = (await res.json()) as {
    email: string;
    user_id?: string;
    roles?: string[];
  };
  return {
    id: body.user_id ?? "",
    email: body.email,
    role: body.roles?.[0],
  };
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return (body as { error?: string }).error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function login(email: string, password: string): Promise<User> {
  const res = await post("/auth/session/login", { email, password });
  if (!res.ok) throw new Error(await errorMessage(res, "Login failed"));
  const body = (await res.json()) as AccessTokenResponse;
  if (!body.access_token) {
    throw new Error("Login failed: missing access token");
  }
  clearTokens();
  storeAccessToken(body.access_token);
  return { id: "", email: body.email ?? email };
}

const GATEWAY_API_PREFIX = /^\/(auth|product|inventory|order)\//;

function sessionGatewayUrl(url: string): string | null {
  if (!GATEWAY_API_PREFIX.test(url)) return null;
  if (url.startsWith("/auth/session/")) return null;
  return `/auth/session/gateway${url}`;
}

export async function authedFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const gatewayUrl = sessionGatewayUrl(url);
  if (gatewayUrl) {
    const headers = new Headers(init.headers as HeadersInit);
    headers.delete("Authorization");
    const res = await fetch(gatewayUrl, {
      ...init,
      headers,
      credentials: "include",
    });
    if (res.status === 401) {
      clearTokens();
      throw new Error("Session expired. Please sign in again.");
    }
    return res;
  }

  let accessToken = readAccessToken();
  if (!accessToken) {
    if (!(await tryRefresh())) {
      throw new Error("Not authenticated");
    }
    accessToken = readAccessToken()!;
  }

  const headers = new Headers(init.headers as HeadersInit);
  headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    if (await tryRefresh()) {
      const refreshed = readAccessToken()!;
      headers.set("Authorization", `Bearer ${refreshed}`);
      return fetch(url, { ...init, headers });
    }
    clearTokens();
    throw new Error("Session expired. Please sign in again.");
  }

  return res;
}

export async function logout(): Promise<void> {
  await post("/auth/session/logout").catch(() => {});
  clearTokens();
}
