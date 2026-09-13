#!/usr/bin/env node
/**
 * Shared-session test: a session created on one SSR task must resolve on
 * another.
 *
 * The session store keeps the refresh token and cached access token server
 * side. With the per-process `Map` backend that state is task-local, so behind
 * a load balancer without session affinity a request landing on a second task
 * finds no session and the operator is logged out. With `REDIS_URL` set, both
 * tasks read the same record.
 *
 * Point two dev servers at one Redis and one gateway, then run this:
 *   REDIS_URL=redis://localhost:6379 DUPLI1_GATEWAY_URL=http://localhost:8080 \
 *     npm run dev -- --port 5301
 *   REDIS_URL=redis://localhost:6379 DUPLI1_GATEWAY_URL=http://localhost:8080 \
 *     npm run dev -- --port 5302
 *   TASK_A=http://localhost:5301 TASK_B=http://localhost:5302 \
 *     node scripts/test-session-shared.mjs
 *
 * Run it with REDIS_URL unset on both servers and it must fail — that is the
 * behaviour this feature exists to remove.
 */
const TASK_A = process.env.TASK_A ?? "http://localhost:5301";
const TASK_B = process.env.TASK_B ?? "http://localhost:5302";
const EMAIL = process.env.MOCK_ADMIN_EMAIL ?? "admin@dupli1.com";
const PASSWORD = process.env.MOCK_ADMIN_PASSWORD ?? "Dupli1Admin2026!";

let failures = 0;
const cookieJar = new Map();

function storeCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookieJar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

/** Same cookie jar for both tasks — exactly what a browser behind an ALB does. */
async function request(base, path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookieJar.size > 0) {
    headers.set(
      "Cookie",
      [...cookieJar].map(([k, v]) => `${k}=${v}`).join("; ")
    );
  }
  const res = await fetch(`${base}${path}`, { ...init, headers, redirect: "manual" });
  storeCookies(res);
  return res;
}

function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** An authenticated gateway path to prove the session works, not just resolves.
 *  Override for another app: the storefront uses /auth/session/gateway/api/v1/… */
const API_PATH =
  process.env.API_PATH ?? "/auth/session/gateway/order/api/v1/orders";

/** Session cookie name; the storefront calls its cookie dupli1_session. */
const SESSION_COOKIE = process.env.SESSION_COOKIE ?? "dupli1_sid";

async function main() {
  console.log(`Shared session test\n  task A: ${TASK_A}\n  task B: ${TASK_B}\n`);

  const login = await request(TASK_A, "/auth/session/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  check("signed in on task A", login.status === 200, `status=${login.status}`);
  check("session cookie issued", cookieJar.has(SESSION_COOKIE));
  if (failures > 0) return;

  console.log("\nsame cookie, other task");
  const meOnB = await request(TASK_B, "/auth/session/me");
  check("task B resolves the session", meOnB.status === 200, `status=${meOnB.status}`);
  if (meOnB.status === 200) {
    const body = await meOnB.json();
    check("task B sees the same identity", body.email === EMAIL, `email=${body.email}`);
  }

  const apiOnB = await request(TASK_B, API_PATH);
  check("task B proxies an API call", apiOnB.status === 200, `status=${apiOnB.status}`);

  console.log("\nrotation is shared, not per task");
  // Refresh on B rotates the token; A must pick up the replacement from the
  // store rather than replaying the one it cached at login.
  const refreshOnB = await request(TASK_B, "/auth/session/refresh", { method: "POST" });
  check("refresh on task B accepted", refreshOnB.status === 200, `status=${refreshOnB.status}`);
  const apiOnA = await request(TASK_A, API_PATH);
  check("task A still works after B rotated", apiOnA.status === 200, `status=${apiOnA.status}`);

  const refreshOnA = await request(TASK_A, "/auth/session/refresh", { method: "POST" });
  check("refresh on task A accepted", refreshOnA.status === 200, `status=${refreshOnA.status}`);
  const apiOnB2 = await request(TASK_B, API_PATH);
  check("task B still works after A rotated", apiOnB2.status === 200, `status=${apiOnB2.status}`);

  console.log("\nround robin across both tasks");
  const alternating = await Promise.all(
    Array.from({ length: 8 }, (_, i) => request(i % 2 ? TASK_B : TASK_A, API_PATH))
  );
  const codes = alternating.map((r) => r.status);
  check(
    "8 interleaved calls all succeeded",
    codes.every((c) => c === 200),
    `statuses=${codes.join(",")}`
  );

  console.log("\nlogout propagates");
  const logout = await request(TASK_A, "/auth/session/logout", { method: "POST" });
  check("logout on task A accepted", logout.status === 200 || logout.status === 204, `status=${logout.status}`);
  const afterLogout = await request(TASK_B, "/auth/session/me");
  check(
    "task B rejects the session after logout on A",
    afterLogout.status === 401,
    `status=${afterLogout.status}`
  );
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
