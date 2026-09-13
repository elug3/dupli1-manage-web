#!/usr/bin/env node
/**
 * Session durability test: the server-side session must survive repeated
 * access-token refreshes.
 *
 * Auth rotates refresh tokens, so each exchange invalidates the token it was
 * given and returns a replacement. If the BFF drops that replacement, the
 * session is left holding a dead token: the first refresh 401s, the session is
 * cleared, and the operator is bounced to /login roughly every access-token
 * lifetime (15 minutes) instead of lasting the session's 30 days.
 *
 * Run against a dev server pointed at a real auth service:
 *   DUPLI1_GATEWAY_URL=http://localhost:8080 npm run dev -- --port 5274
 *   TEST_BASE_URL=http://localhost:5274 node scripts/test-session-refresh.mjs
 */
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5173";
const EMAIL = process.env.MOCK_ADMIN_EMAIL ?? "admin@dupli1.com";
const PASSWORD = process.env.MOCK_ADMIN_PASSWORD ?? "Dupli1Admin2026!";
const ROUNDS = Number(process.env.REFRESH_ROUNDS ?? 5);

const cookieJar = new Map();
let failures = 0;

function storeCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookieJar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookieJar.size > 0) {
    headers.set(
      "Cookie",
      [...cookieJar].map(([k, v]) => `${k}=${v}`).join("; ")
    );
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  storeCookies(res);
  return res;
}

function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const ORDERS = "/auth/session/gateway/order/api/v1/orders";

async function main() {
  console.log(`Session durability test at ${BASE}\n`);

  const login = await request("/auth/session/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  check("signed in", login.status === 200, `status=${login.status}`);
  check("session cookie issued", cookieJar.has("dupli1_sid"));
  if (failures > 0) return;

  // Each round forces a real exchange. Round 1 is where the bug bit: login had
  // already spent the stored token, so auth rejected it.
  console.log(`\n${ROUNDS} forced refreshes (each rotates the token)`);
  for (let round = 1; round <= ROUNDS; round += 1) {
    const refresh = await request("/auth/session/refresh", { method: "POST" });
    check(`refresh #${round} accepted`, refresh.status === 200, `status=${refresh.status}`);
    const api = await request(ORDERS);
    check(`api call after refresh #${round}`, api.status === 200, `status=${api.status}`);
    if (failures > 0) {
      console.log("\n  session died — stopping here");
      return;
    }
  }

  // Parallel callers that all miss the cache must not spend the same token and
  // knock each other out; the BFF coalesces them onto one exchange.
  console.log("\nconcurrent callers after a forced refresh");
  await request("/auth/session/refresh", { method: "POST" });
  const parallel = await Promise.all(
    Array.from({ length: 6 }, () => request(ORDERS))
  );
  const codes = parallel.map((r) => r.status);
  check(
    "6 concurrent API calls all succeeded",
    codes.every((c) => c === 200),
    `statuses=${codes.join(",")}`
  );

  const me = await request("/auth/session/me");
  check("session still valid at the end", me.status === 200, `status=${me.status}`);
  check("session cookie was never cleared", cookieJar.get("dupli1_sid")?.length > 0);

  const logout = await request("/auth/session/logout", { method: "POST" });
  check("logout accepted", logout.status === 200 || logout.status === 204, `status=${logout.status}`);
}

main()
  .then(() => {
    console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\nTest aborted: ${err.message}`);
    process.exit(1);
  });
