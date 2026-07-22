import { AUTH_PREFIX } from "./gateway";

export interface User {
  id: string;
  email: string;
  accountType?: string;
}

interface LoginResponse {
  email?: string;
}

const SESSION_FETCH: RequestInit = { credentials: "include" };

/** Coalesce concurrent refresh attempts so parallel 401s share one exchange. */
let refreshInFlight: Promise<boolean> | null = null;

function post(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    ...SESSION_FETCH,
  });
}

/** Exchange the httpOnly session's refresh_token for a fresh access token. */
export async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = post("/auth/session/refresh")
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (path === "/login" || path.startsWith("/login?")) return;
  window.location.assign("/login");
}

/** Browser paths under `/auth/…` (excluding session helpers) hit the auth service. */
function isAuthServiceUrl(url: string): boolean {
  const path = url.startsWith("http") ? new URL(url).pathname : url;
  return path === AUTH_PREFIX || path.startsWith(`${AUTH_PREFIX}/`);
}

function parseMe(body: {
  email: string;
  user_id?: string;
  account_type?: string;
}): User {
  return {
    id: body.user_id ?? "",
    email: body.email,
    accountType: body.account_type,
  };
}

export async function getMe(): Promise<User | null> {
  const res = await fetch("/auth/session/me", SESSION_FETCH);
  if (res.ok) {
    return parseMe(
      (await res.json()) as {
        email: string;
        user_id?: string;
        account_type?: string;
      }
    );
  }

  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      const retry = await fetch("/auth/session/me", SESSION_FETCH);
      if (retry.ok) {
        return parseMe(
          (await retry.json()) as {
            email: string;
            user_id?: string;
            account_type?: string;
          }
        );
      }
    }
    redirectToLogin();
  }

  return null;
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
  const body = (await res.json()) as LoginResponse;
  return { id: "", email: body.email ?? email };
}

/** All product/order/inventory/auth API calls go through the cookie-authenticated
 * session gateway, which exchanges and caches the access token server-side. */
export async function authedFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers as HeadersInit);
  headers.delete("Authorization");

  const gatewayUrl = `/auth/session/gateway${url}`;
  const doFetch = () =>
    fetch(gatewayUrl, {
      ...init,
      headers,
      credentials: "include",
    });

  let res = await doFetch();
  if (res.status !== 401) return res;

  // Session/access token expired — try refresh_token once, then retry.
  const refreshed = await refreshSession();
  if (refreshed) {
    res = await doFetch();
    if (res.status !== 401) return res;
  } else {
    // Refresh failed: session is no longer usable (auth/session).
    redirectToLogin();
    throw new Error("Session expired. Please sign in again.");
  }

  // Still 401 after a successful refresh. Only bounce to login when the
  // auth service itself rejected the call — product/order/inventory 401s
  // (e.g. JWKS mismatch) should surface as errors instead.
  if (isAuthServiceUrl(url)) {
    redirectToLogin();
    throw new Error("Session expired. Please sign in again.");
  }

  return res;
}

export async function logout(): Promise<void> {
  await post("/auth/session/logout").catch(() => {});
}
