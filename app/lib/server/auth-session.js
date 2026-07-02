import { backendGet, backendPost, serviceUrl } from "./backend";
import { clearSessionCookieHeader, getSessionId, setSessionCookieHeader, } from "./session-cookie";
import { createSession, deleteSession, getRefreshToken, getSession, } from "./session-store";
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
async function exchangeRefreshToken(refreshToken) {
    const res = await backendPost("auth", "/api/v1/auth/refresh", {
        refresh_token: refreshToken,
    });
    if (!res.ok)
        return null;
    const body = (await res.json());
    return { accessToken: body.token };
}
async function fetchAuthProfile(accessToken) {
    const res = await backendGet("auth", "/api/v1/auth/me", accessToken);
    if (!res.ok)
        return null;
    return res.json();
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
    const res = await backendPost("auth", "/api/v1/auth/login", { email, password });
    if (!res.ok) {
        return jsonResponse({ error: await readError(res, "Login failed") }, { status: res.status });
    }
    const { refresh_token } = (await res.json());
    const exchanged = await exchangeRefreshToken(refresh_token);
    if (!exchanged) {
        return jsonResponse({ error: "Failed to establish session" }, { status: 502 });
    }
    const profile = (await fetchAuthProfile(exchanged.accessToken)) ?? {
        user_id: "",
        email,
        roles: [],
    };
    const sessionId = createSession(refresh_token, profile.email || email, profile.user_id, profile.roles ?? []);
    return jsonResponse({ access_token: exchanged.accessToken, email }, { headers: { "Set-Cookie": setSessionCookieHeader(sessionId, request) } });
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
export async function handleSessionLogout(request) {
    const sessionId = getSessionId(request);
    if (sessionId) {
        const refreshToken = getRefreshToken(sessionId);
        if (refreshToken) {
            await backendPost("auth", "/api/v1/auth/logout", {
                refresh_token: refreshToken,
            }).catch(() => { });
        }
        deleteSession(sessionId);
    }
    return new Response(null, {
        status: 204,
        headers: { "Set-Cookie": clearSessionCookieHeader(request) },
    });
}
export async function handleSessionMe(request) {
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
    return jsonResponse({
        email: session.email,
        user_id: session.userId,
        roles: session.roles,
    });
}
/** Server-side register proxy using the signed-in admin's session. */
export async function handleSessionRegister(request) {
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
    const exchanged = await exchangeRefreshToken(refreshToken);
    if (!exchanged) {
        deleteSession(sessionId);
        return jsonResponse({ error: "Session expired" }, {
            status: 401,
            headers: { "Set-Cookie": clearSessionCookieHeader(request) },
        });
    }
    let body;
    try {
        body = (await request.json());
    }
    catch {
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
            Authorization: `Bearer ${exchanged.accessToken}`,
        },
        body: JSON.stringify({ email: body.email, password: body.password }),
    });
    if (!res.ok) {
        return jsonResponse({ error: await readError(res, "Failed to register user") }, { status: res.status });
    }
    const data = (await res.json());
    return jsonResponse({ user_id: data.user_id }, { status: 201 });
}
