import { afterEach, describe, expect, it, vi } from "vitest";

import {
  handleSessionGatewayProxy,
  handleSessionLogin,
  handleSessionRefresh,
} from "./auth-session";

/**
 * Auth rotates refresh tokens: every exchange invalidates the token it was
 * given and returns a replacement. The stub enforces exactly that, so a caller
 * that fails to store the replacement gets the 401 a real deploy would give it.
 */
function stubAuth(): {
  refreshCalls: () => number;
  presentedTokens: () => string[];
  currentToken: () => string;
} {
  let issued = 0;
  let valid = "";
  const presented: string[] = [];

  function issue(): string {
    issued += 1;
    valid = `rt-${issued}`;
    return valid;
  }

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const target = String(url);
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (target.endsWith("/api/v1/auth/login")) {
        return json({ refresh_token: issue() });
      }

      if (target.endsWith("/api/v1/auth/refresh")) {
        presented.push(String(body.refresh_token));
        if (body.refresh_token !== valid) {
          // Already rotated, or never ours.
          return json({ error: "invalid refresh token" }, 401);
        }
        // The access token is deliberately not a JWT: jwtExpiryMs cannot read
        // an expiry, so the cached token is treated as stale and every call
        // exercises the exchange path.
        return json({ token: `access-${issued}`, refresh_token: issue() });
      }

      if (target.endsWith("/api/v1/auth/me")) {
        return json({
          user_id: "usr-1",
          email: "admin@example.com",
          account_type: "manager",
          permissions: ["order.read.all"],
        });
      }

      if (target.includes("/api/v1/orders")) {
        return json({ total: 0, orders: [] });
      }

      throw new Error(`unexpected fetch: ${target}`);
    })
  );

  const fetchMock = () => vi.mocked(globalThis.fetch);
  return {
    refreshCalls: () =>
      fetchMock().mock.calls.filter((call) =>
        String(call[0]).endsWith("/api/v1/auth/refresh")
      ).length,
    presentedTokens: () => [...presented],
    currentToken: () => valid,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function signIn(): Promise<string> {
  const response = await handleSessionLogin(
    new Request("http://localhost/auth/session/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "secret" }),
    })
  );
  expect(response.status).toBe(200);
  const cookie = response.headers.get("Set-Cookie");
  expect(cookie).toBeTruthy();
  return cookie!.split(";")[0];
}

function refresh(cookie: string): Promise<Response> {
  return handleSessionRefresh(
    new Request("http://localhost/auth/session/refresh", {
      method: "POST",
      headers: { Cookie: cookie },
    })
  );
}

function listOrders(cookie: string): Promise<Response> {
  return handleSessionGatewayProxy(
    new Request(
      "http://localhost/auth/session/gateway/order/api/v1/orders",
      { headers: { Cookie: cookie } }
    )
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refresh token rotation", () => {
  it("keeps the session alive across repeated refreshes", async () => {
    const auth = stubAuth();
    const cookie = await signIn();

    // Login itself spends the token auth issued, to prime the access-token
    // cache. Storing that spent token is what used to make the first refresh
    // fail and clear the session.
    for (let round = 1; round <= 4; round += 1) {
      const response = await refresh(cookie);
      expect(response.status, `refresh #${round}`).toBe(200);
    }
  });

  it("presents the replacement token, never the one already spent", async () => {
    const auth = stubAuth();
    const cookie = await signIn();

    await refresh(cookie);
    await refresh(cookie);

    // Each exchange must present a distinct, newer token.
    const presented = auth.presentedTokens();
    expect(presented).toEqual(["rt-1", "rt-2", "rt-3"]);
    expect(new Set(presented).size).toBe(presented.length);
  });

  it("still serves API calls after several rotations", async () => {
    stubAuth();
    const cookie = await signIn();

    await refresh(cookie);
    await refresh(cookie);
    const response = await listOrders(cookie);

    expect(response.status).toBe(200);
  });

  it("ends the session when auth genuinely rejects the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const target = String(url);
        if (target.endsWith("/api/v1/auth/login")) {
          return json({ refresh_token: "rt-1" });
        }
        if (target.endsWith("/api/v1/auth/refresh")) {
          return json({ token: "access-1", refresh_token: "rt-2" });
        }
        if (target.endsWith("/api/v1/auth/me")) {
          return json({ user_id: "u", email: "a@b.c", account_type: "manager" });
        }
        throw new Error(`unexpected fetch: ${target}`);
      })
    );
    const cookie = await signIn();

    // Auth now refuses everything: a revoked token, not a rotation race.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "invalid refresh token" }, 401))
    );

    const response = await refresh(cookie);
    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("coalesces parallel exchanges onto one request", async () => {
    const auth = stubAuth();
    const cookie = await signIn();
    const before = auth.refreshCalls();

    // Four callers all miss the cache. Without coalescing each spends the same
    // token and three of them are rejected.
    const responses = await Promise.all([
      listOrders(cookie),
      listOrders(cookie),
      listOrders(cookie),
      listOrders(cookie),
    ]);

    for (const response of responses) expect(response.status).toBe(200);
    expect(auth.refreshCalls() - before).toBe(1);
  });
});

/**
 * Auth answers 503 when it cannot reach its own session ledger — that ledger
 * lives in Redis, and the Redis task is replaced stop-before-start on every
 * deploy. Before this, any non-ok refresh was read as a spent token, so those
 * few seconds signed out every operator holding a perfectly good session.
 */
describe("auth unavailable is not a dead session", () => {
  function stubAuthThen(
    afterLogin: (url: string) => Response
  ): () => Promise<string> {
    return async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: unknown) => {
          const target = String(url);
          if (target.endsWith("/api/v1/auth/login")) {
            return json({ refresh_token: "rt-1" });
          }
          if (target.endsWith("/api/v1/auth/refresh")) {
            return json({ token: "access-1", refresh_token: "rt-2" });
          }
          if (target.endsWith("/api/v1/auth/me")) {
            return json({ user_id: "u", email: "a@b.c", account_type: "manager" });
          }
          throw new Error(`unexpected fetch: ${target}`);
        })
      );
      const cookie = await signIn();
      vi.stubGlobal("fetch", vi.fn(async (url: unknown) => afterLogin(String(url))));
      return cookie;
    };
  }

  it("keeps the session and the cookie when auth returns 503", async () => {
    const cookie = await stubAuthThen(() =>
      json({ error: "refresh unavailable" }, 503)
    )();

    const response = await refresh(cookie);

    expect(response.status).toBe(503);
    // The cookie must survive: clearing it is the logout we are preventing.
    expect(response.headers.get("Set-Cookie") ?? "").not.toContain("Max-Age=0");
  });

  it("recovers on the next call once auth is back", async () => {
    const cookie = await stubAuthThen(() =>
      json({ error: "refresh unavailable" }, 503)
    )();

    expect((await refresh(cookie)).status).toBe(503);

    // Auth returns, still holding the token the session stored. If the 503 had
    // been treated as a rejection the session would be gone by now.
    let issued = 1;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const target = String(url);
        if (target.endsWith("/api/v1/auth/refresh")) {
          issued += 1;
          return json({ token: `access-${issued}`, refresh_token: `rt-${issued + 1}` });
        }
        if (target.includes("/api/v1/orders")) return json({ total: 0, orders: [] });
        throw new Error(`unexpected fetch: ${target}`);
      })
    );

    expect((await refresh(cookie)).status).toBe(200);
    expect((await listOrders(cookie)).status).toBe(200);
  });

  it("does not sign the operator out when auth cannot be dialled at all", async () => {
    const cookie = await stubAuthThen(() => {
      throw new Error("ECONNREFUSED");
    })();

    const response = await refresh(cookie);

    expect(response.status).toBe(503);
    expect(response.headers.get("Set-Cookie") ?? "").not.toContain("Max-Age=0");
  });

  it("still ends the session on a 401, which is auth's own verdict", async () => {
    const cookie = await stubAuthThen(() =>
      json({ error: "invalid refresh token" }, 401)
    )();

    const response = await refresh(cookie);

    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("passes 503 through the API gateway without a logout", async () => {
    const cookie = await stubAuthThen(() =>
      json({ error: "refresh unavailable" }, 503)
    )();

    const response = await listOrders(cookie);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "auth_unavailable" });
  });
});
