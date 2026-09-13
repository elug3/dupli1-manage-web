/**
 * Server-side session storage.
 *
 * Sessions hold the refresh token and a short-lived cached access token, so
 * neither ever reaches the browser — the `dupli1_sid` cookie carries only an id.
 *
 * Backed by Redis when `REDIS_URL` is set, so every SSR task resolves the same
 * session; otherwise a per-process `Map`, which keeps `npm run dev` working with
 * no infrastructure. **The in-memory backend is only correct for a single
 * task**: behind a load balancer without session affinity, a request landing on
 * another task finds no session and the operator is logged out. Production runs
 * more than one task on `redis.dupli1.local` — see CLAUDE.md.
 *
 * Every function is async because Redis is. Calls come from one file
 * (`auth-session.ts`), all inside request handlers.
 */

export interface SessionRecord {
  refreshToken: string;
  email: string;
  userId: string;
  permissions: string[];
  accountType: string;
  createdAt: number;
  accessToken: string | null;
  accessTokenExpiresAt: number;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Namespaced so a shared Redis can serve other consumers safely. */
const KEY_PREFIX = "manage:session:";

interface Backend {
  readonly kind: "memory" | "redis";
  read(sessionId: string): Promise<SessionRecord | null>;
  write(sessionId: string, record: SessionRecord): Promise<void>;
  remove(sessionId: string): Promise<void>;
}

// ── In-memory backend ────────────────────────────────────────────────────────

function memoryBackend(): Backend {
  const sessions = new Map<string, SessionRecord>();

  const expired = (record: SessionRecord) =>
    Date.now() - record.createdAt > SESSION_TTL_MS;

  return {
    kind: "memory",
    async read(sessionId) {
      const record = sessions.get(sessionId);
      if (!record) return null;
      if (expired(record)) {
        sessions.delete(sessionId);
        return null;
      }
      return record;
    },
    async write(sessionId, record) {
      // Opportunistic prune: without a timer, expiry is enforced on access.
      for (const [id, existing] of sessions) {
        if (expired(existing)) sessions.delete(id);
      }
      sessions.set(sessionId, record);
    },
    async remove(sessionId) {
      sessions.delete(sessionId);
    },
  };
}

// ── Redis backend ────────────────────────────────────────────────────────────

/**
 * Imported dynamically so the client bundle never pulls in a Node-only package,
 * and so a dev server without `REDIS_URL` does not load it at all.
 */
async function redisBackend(url: string): Promise<Backend> {
  const { createClient } = await import("redis");
  const client = createClient({ url });

  // node-redis queues commands and reconnects on its own; log so a sustained
  // outage is visible rather than showing up only as mystery logouts.
  client.on("error", (error: unknown) => {
    console.error("session store: redis error", error);
  });

  await client.connect();

  return {
    kind: "redis",
    async read(sessionId) {
      const raw = await client.get(`${KEY_PREFIX}${sessionId}`);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as SessionRecord;
      } catch {
        // Unreadable record is the same as no session; drop it.
        await client.del(`${KEY_PREFIX}${sessionId}`);
        return null;
      }
    },
    async write(sessionId, record) {
      // Redis enforces the 30-day TTL, refreshed on every write, so an active
      // session does not expire mid-use and an abandoned one is collected.
      await client.set(`${KEY_PREFIX}${sessionId}`, JSON.stringify(record), {
        PX: SESSION_TTL_MS,
      });
    },
    async remove(sessionId) {
      await client.del(`${KEY_PREFIX}${sessionId}`);
    },
  };
}

// ── Backend selection ────────────────────────────────────────────────────────

let backendPromise: Promise<Backend> | null = null;

function backend(): Promise<Backend> {
  if (!backendPromise) {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      backendPromise = Promise.resolve(memoryBackend());
    } else {
      backendPromise = redisBackend(url).catch((error) => {
        // Do not silently fall back to memory: that would split sessions across
        // tasks and hide the outage behind intermittent logouts.
        backendPromise = null;
        throw error;
      });
    }
  }
  return backendPromise;
}

/** Which backend is in use, for the settings/health surface and tests. */
export async function sessionStoreKind(): Promise<"memory" | "redis"> {
  return (await backend()).kind;
}

async function patch(
  sessionId: string,
  changes: Partial<SessionRecord>
): Promise<void> {
  const store = await backend();
  const record = await store.read(sessionId);
  if (!record) return;
  await store.write(sessionId, { ...record, ...changes });
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function createSession(
  refreshToken: string,
  email: string,
  userId: string,
  permissions: string[] = [],
  accountType = "customer"
): Promise<string> {
  const store = await backend();
  const sessionId = crypto.randomUUID();
  await store.write(sessionId, {
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

export async function getSession(
  sessionId: string
): Promise<SessionRecord | null> {
  return (await backend()).read(sessionId);
}

export async function getRefreshToken(
  sessionId: string
): Promise<string | null> {
  return (await getSession(sessionId))?.refreshToken ?? null;
}

/** Cached access token, exchanged from the refresh token, if still fresh. */
export async function getCachedAccessToken(
  sessionId: string
): Promise<string | null> {
  const record = await getSession(sessionId);
  if (!record?.accessToken) return null;
  if (Date.now() >= record.accessTokenExpiresAt) return null;
  return record.accessToken;
}

export async function setCachedAccessToken(
  sessionId: string,
  accessToken: string,
  expiresAt: number
): Promise<void> {
  await patch(sessionId, { accessToken, accessTokenExpiresAt: expiresAt });
}

/** Drop a cached access token so the next exchange hits auth refresh. */
export async function clearCachedAccessToken(sessionId: string): Promise<void> {
  await patch(sessionId, { accessToken: null, accessTokenExpiresAt: 0 });
}

export async function updateSessionRefreshToken(
  sessionId: string,
  refreshToken: string
): Promise<void> {
  await patch(sessionId, { refreshToken });
}

/**
 * Store the results of one refresh exchange together.
 *
 * The rotated refresh token and the access token it produced must land in the
 * same write: a task that saw only one of them would either re-spend a dead
 * token or hand out an access token the session cannot renew.
 */
export async function commitTokenExchange(
  sessionId: string,
  refreshToken: string,
  accessToken: string,
  accessTokenExpiresAt: number
): Promise<void> {
  await patch(sessionId, { refreshToken, accessToken, accessTokenExpiresAt });
}

export async function deleteSession(sessionId: string): Promise<void> {
  await (await backend()).remove(sessionId);
}
