const sessions = new Map();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
function pruneExpired() {
    const now = Date.now();
    for (const [id, record] of sessions) {
        if (now - record.createdAt > SESSION_TTL_MS) {
            sessions.delete(id);
        }
    }
}
export function createSession(refreshToken) {
    pruneExpired();
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { refreshToken, createdAt: Date.now() });
    return sessionId;
}
export function getRefreshToken(sessionId) {
    const record = sessions.get(sessionId);
    if (!record)
        return null;
    if (Date.now() - record.createdAt > SESSION_TTL_MS) {
        sessions.delete(sessionId);
        return null;
    }
    return record.refreshToken;
}
export function updateSessionRefreshToken(sessionId, refreshToken) {
    const record = sessions.get(sessionId);
    if (!record)
        return;
    sessions.set(sessionId, { refreshToken, createdAt: record.createdAt });
}
export function deleteSession(sessionId) {
    sessions.delete(sessionId);
}
