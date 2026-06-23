import { backendPost } from "./backend";
import { clearSessionCookieHeader, getSessionId, setSessionCookieHeader, } from "./session-cookie";
import { createSession, deleteSession, getRefreshToken, updateSessionRefreshToken, } from "./session-store";
function jsonResponse(body, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify(body), { ...init, headers });
}
async function readError(res, fallback) {
    try {
        const body = (await res.json());
        return body.error ?? fallback;
    }
    catch {
        return fallback;
    }
}
export async function handleSessionLogin(request) {
    let email;
    let password;
    try {
        const body = (await request.json());
        if (!body.email || !body.password) {
            return jsonResponse({ error: "Email and password are required" }, {
                status: 400,
            });
        }
        email = body.email;
        password = body.password;
    }
    catch {
        return jsonResponse({ error: "Invalid request body" }, { status: 400 });
    }
    const res = await backendPost("/api/v1/auth/login", { email, password });
    if (!res.ok) {
        return jsonResponse({ error: await readError(res, "Login failed") }, { status: res.status });
    }
    const tokens = (await res.json());
    const sessionId = createSession(tokens.refresh_token);
    return jsonResponse({ access_token: tokens.access_token }, { headers: { "Set-Cookie": setSessionCookieHeader(sessionId) } });
}
export async function handleSessionRefresh(request) {
    const sessionId = getSessionId(request);
    if (!sessionId) {
        return jsonResponse({ error: "No session" }, { status: 401 });
    }
    const refreshToken = getRefreshToken(sessionId);
    if (!refreshToken) {
        return jsonResponse({ error: "Session expired" }, {
            status: 401,
            headers: { "Set-Cookie": clearSessionCookieHeader() },
        });
    }
    const res = await backendPost("/api/v1/auth/refresh", { refresh_token: refreshToken });
    if (!res.ok) {
        deleteSession(sessionId);
        return jsonResponse({ error: "Session expired" }, {
            status: 401,
            headers: { "Set-Cookie": clearSessionCookieHeader() },
        });
    }
    const tokens = (await res.json());
    updateSessionRefreshToken(sessionId, tokens.refresh_token);
    return jsonResponse({ access_token: tokens.access_token });
}
export async function handleSessionLogout(request) {
    const sessionId = getSessionId(request);
    if (sessionId) {
        const refreshToken = getRefreshToken(sessionId);
        if (refreshToken) {
            await backendPost("/api/v1/auth/logout", {
                refresh_token: refreshToken,
            }).catch(() => { });
        }
        deleteSession(sessionId);
    }
    return jsonResponse({ ok: true }, { headers: { "Set-Cookie": clearSessionCookieHeader() } });
}
