interface SessionRecord {
  refreshToken: string;
  email: string;
  createdAt: number;
}

const sessions = new Map<string, SessionRecord>();

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, record] of sessions) {
    if (now - record.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export function createSession(refreshToken: string, email: string): string {
  pruneExpired();
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { refreshToken, email, createdAt: Date.now() });
  return sessionId;
}

export function getSession(sessionId: string): SessionRecord | null {
  const record = sessions.get(sessionId);
  if (!record) return null;
  if (Date.now() - record.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  return record;
}

export function getRefreshToken(sessionId: string): string | null {
  return getSession(sessionId)?.refreshToken ?? null;
}

export function updateSessionRefreshToken(
  sessionId: string,
  refreshToken: string
): void {
  const record = sessions.get(sessionId);
  if (!record) return;
  sessions.set(sessionId, { ...record, refreshToken });
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}
