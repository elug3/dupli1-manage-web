import { AUTH_PREFIX } from "./gateway";
const SESSION_FETCH = { credentials: "include" };
/** Coalesce concurrent refresh attempts so parallel 401s share one exchange. */
let refreshInFlight = null;
function post(url, body) {
    return fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        ...SESSION_FETCH,
    });
}
/** Exchange the httpOnly session's refresh_token for a fresh access token. */
export async function refreshSession() {
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
function redirectToLogin() {
    if (typeof window === "undefined")
        return;
    const path = window.location.pathname;
    if (path === "/login" || path.startsWith("/login?"))
        return;
    window.location.assign("/login");
}
/** Browser paths under `/auth/…` (excluding session helpers) hit the auth service. */
function isAuthServiceUrl(url) {
    const path = url.startsWith("http") ? new URL(url).pathname : url;
    return path === AUTH_PREFIX || path.startsWith(`${AUTH_PREFIX}/`);
}
function parseMe(body) {
    return {
        id: body.user_id ?? "",
        email: body.email,
        accountType: body.account_type,
    };
}
export async function getMe() {
    const res = await fetch("/auth/session/me", SESSION_FETCH);
    if (res.ok) {
        return parseMe((await res.json()));
    }
    if (res.status === 401) {
        const refreshed = await refreshSession();
        if (refreshed) {
            const retry = await fetch("/auth/session/me", SESSION_FETCH);
            if (retry.ok) {
                return parseMe((await retry.json()));
            }
        }
        redirectToLogin();
    }
    return null;
}
async function errorMessage(res, fallback) {
    try {
        const body = await res.json();
        return body.error ?? fallback;
    }
    catch {
        return fallback;
    }
}
export async function login(email, password) {
    const res = await post("/auth/session/login", { email, password });
    if (!res.ok)
        throw new Error(await errorMessage(res, "Login failed"));
    const body = (await res.json());
    return { id: "", email: body.email ?? email };
}
/** All product/order/inventory/auth API calls go through the cookie-authenticated
 * session gateway, which exchanges and caches the access token server-side. */
export async function authedFetch(url, init = {}) {
    const headers = new Headers(init.headers);
    headers.delete("Authorization");
    const gatewayUrl = `/auth/session/gateway${url}`;
    const doFetch = () => fetch(gatewayUrl, {
        ...init,
        headers,
        credentials: "include",
    });
    let res = await doFetch();
    if (res.status !== 401)
        return res;
    // Session/access token expired — try refresh_token once, then retry.
    const refreshed = await refreshSession();
    if (refreshed) {
        res = await doFetch();
        if (res.status !== 401)
            return res;
    }
    else {
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
export async function logout() {
    await post("/auth/session/logout").catch(() => { });
}
