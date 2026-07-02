const SESSION_FETCH = { credentials: "include" };
function post(url, body) {
    return fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        ...SESSION_FETCH,
    });
}
function readAccessToken() {
    try {
        return localStorage.getItem("dupli1_at");
    }
    catch {
        return null;
    }
}
function storeAccessToken(accessToken) {
    localStorage.setItem("dupli1_at", accessToken);
}
export function clearTokens() {
    try {
        localStorage.removeItem("dupli1_at");
        localStorage.removeItem("dupli1_rt");
    }
    catch {
        // no-op in SSR
    }
}
async function tryRefresh() {
    const res = await post("/auth/session/refresh");
    if (!res.ok) {
        clearTokens();
        return false;
    }
    const body = (await res.json());
    storeAccessToken(body.access_token);
    return true;
}
export async function getMe() {
    const accessToken = readAccessToken();
    if (!accessToken) {
        if (await tryRefresh())
            return getMe();
        return null;
    }
    const res = await fetch("/auth/session/me", SESSION_FETCH);
    if (res.status === 401) {
        if (await tryRefresh())
            return getMe();
        return null;
    }
    if (!res.ok)
        return null;
    const body = (await res.json());
    return {
        id: body.user_id ?? "",
        email: body.email,
        role: body.roles?.[0],
    };
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
    if (!body.access_token) {
        throw new Error("Login failed: missing access token");
    }
    clearTokens();
    storeAccessToken(body.access_token);
    return { id: "", email: body.email ?? email };
}
const GATEWAY_API_PREFIX = /^\/(auth|product|inventory|order)\//;
function sessionGatewayUrl(url) {
    if (!GATEWAY_API_PREFIX.test(url))
        return null;
    if (url.startsWith("/auth/session/"))
        return null;
    return `/auth/session/gateway${url}`;
}
export async function authedFetch(url, init = {}) {
    const gatewayUrl = sessionGatewayUrl(url);
    if (gatewayUrl) {
        const headers = new Headers(init.headers);
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
        accessToken = readAccessToken();
    }
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    const res = await fetch(url, { ...init, headers });
    if (res.status === 401) {
        if (await tryRefresh()) {
            const refreshed = readAccessToken();
            headers.set("Authorization", `Bearer ${refreshed}`);
            return fetch(url, { ...init, headers });
        }
        clearTokens();
        throw new Error("Session expired. Please sign in again.");
    }
    return res;
}
export async function logout() {
    await post("/auth/session/logout").catch(() => { });
    clearTokens();
}
