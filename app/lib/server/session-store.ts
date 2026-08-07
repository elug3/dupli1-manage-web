interface SessionRecord {
  refreshToken: string;
  email: string;
  userId: string;
  permissions: string[];
  accountType: string;
  createdAt: number;
  accessToken: string | null;
  accessTokenExpiresAt: number;
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

export function createSession(
  refreshToken: string,
  email: string,
  userId: string,
  permissions: string[] = [],
  accountType = "customer"
): string {
  pruneExpired();
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, {
    refreshToken,
    email,
    userId,
    permissions,
    accountType,
    createdAt: Date.now(),
    accessToken: null,
    accessTokenExpiresAt: 0,
  });
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

/** Cached access token, exchanged from the refresh token, if still fresh. */
export function getCachedAccessToken(sessionId: string): string | null {
  const record = getSession(sessionId);
  if (!record || !record.accessToken) return null;
  if (Date.now() >= record.accessTokenExpiresAt) return null;
  return record.accessToken;
}

export function setCachedAccessToken(
  sessionId: string,
  accessToken: string,
  expiresAt: number
): void {
  const record = sessions.get(sessionId);
  if (!record) return;
  record.accessToken = accessToken;
  record.accessTokenExpiresAt = expiresAt;
}

/** Drop a cached access token so the next exchange hits auth refresh. */
export function clearCachedAccessToken(sessionId: string): void {
  const record = sessions.get(sessionId);
  if (!record) return;
  record.accessToken = null;
  record.accessTokenExpiresAt = 0;
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
