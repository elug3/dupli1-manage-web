function post(url, body) {
    return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}
function readTokens() {
    try {
        const a = localStorage.getItem("schick_at");
        const r = localStorage.getItem("schick_rt");
        if (!a || !r)
            return null;
        return { access_token: a, refresh_token: r };
    }
    catch {
        return null;
    }
}
function storeTokens(t) {
    localStorage.setItem("schick_at", t.access_token);
    localStorage.setItem("schick_rt", t.refresh_token);
}
export function clearTokens() {
    try {
        localStorage.removeItem("schick_at");
        localStorage.removeItem("schick_rt");
    }
    catch {
        // no-op in SSR
    }
}
async function tryRefresh() {
    const tokens = readTokens();
    if (!tokens)
        return false;
    const res = await post("/api/v1/auth/refresh", {
        refresh_token: tokens.refresh_token,
    });
    if (!res.ok) {
        clearTokens();
        return false;
    }
    storeTokens((await res.json()));
    return true;
}
export async function getMe() {
    const tokens = readTokens();
    if (!tokens)
        return null;
    const res = await fetch("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (res.status === 401) {
        if (await tryRefresh())
            return getMe();
        return null;
    }
    if (!res.ok)
        return null;
    return res.json();
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
    const res = await post("/api/v1/auth/login", { email, password });
    if (!res.ok)
        throw new Error(await errorMessage(res, "Login failed"));
    storeTokens((await res.json()));
}
export async function authedFetch(url, init = {}) {
    const tokens = readTokens();
    if (!tokens)
        throw new Error("Not authenticated");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${tokens.access_token}`);
    const res = await fetch(url, { ...init, headers });
    if (res.status === 401) {
        if (await tryRefresh()) {
            const refreshed = readTokens();
            headers.set("Authorization", `Bearer ${refreshed.access_token}`);
            return fetch(url, { ...init, headers });
        }
        clearTokens();
        throw new Error("Session expired. Please sign in again.");
    }
    return res;
}
export async function logout() {
    const tokens = readTokens();
    if (tokens) {
        await post("/api/v1/auth/logout", {
            refresh_token: tokens.refresh_token,
        }).catch(() => { });
    }
    clearTokens();
}
