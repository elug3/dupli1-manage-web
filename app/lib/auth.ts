export interface User {
  id: string;
  email: string;
  role?: string;
}

interface AccessTokenResponse {
  access_token: string;
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
    return localStorage.getItem("schick_at");
  } catch {
    return null;
  }
}

function storeAccessToken(accessToken: string): void {
  localStorage.setItem("schick_at", accessToken);
}

export function clearTokens(): void {
  try {
    localStorage.removeItem("schick_at");
    localStorage.removeItem("schick_rt");
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

  const res = await fetch("/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) {
    if (await tryRefresh()) return getMe();
    return null;
  }

  if (!res.ok) return null;
  return res.json() as Promise<User>;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return (body as { error?: string }).error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function login(email: string, password: string): Promise<void> {
  const res = await post("/auth/session/login", { email, password });
  if (!res.ok) throw new Error(await errorMessage(res, "Login failed"));
  const body = (await res.json()) as AccessTokenResponse;
  clearTokens();
  storeAccessToken(body.access_token);
}

export async function authedFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
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
