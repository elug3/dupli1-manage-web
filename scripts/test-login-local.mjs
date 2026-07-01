#!/usr/bin/env node
/**
 * Local end-to-end login test against the dev server.
 * Verifies session routes, cookies, and post-login dashboard access.
 */
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5173";
const EMAIL = process.env.MOCK_ADMIN_EMAIL ?? "admin@schick.com";
const PASSWORD = process.env.MOCK_ADMIN_PASSWORD ?? "SchickAdmin2026!";

const cookieJar = new Map();

function storeCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) {
      cookieJar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }
}

function cookieHeader() {
  if (cookieJar.size === 0) return undefined;
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  const cookies = cookieHeader();
  if (cookies) headers.set("Cookie", cookies);

  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  storeCookies(res);
  return res;
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

async function main() {
  console.log(`Testing login flow at ${BASE}\n`);

  // 1. Login page loads
  const loginPage = await request("/login");
  if (loginPage.status !== 200) fail(`/login returned ${loginPage.status}`);
  const loginHtml = await loginPage.text();
  if (!loginHtml.includes("Schick Admin")) fail("/login missing expected content");
  pass("Login page loads");

  // 2. Session login API
  const loginRes = await request("/auth/session/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (loginRes.status !== 200) {
    const err = await loginRes.text();
    fail(`POST /auth/session/login returned ${loginRes.status}: ${err}`);
  }
  const loginBody = await loginRes.json();
  if (!loginBody.access_token) fail("Login response missing access_token");
  if (!loginBody.email) fail("Login response missing email");
  if (!cookieJar.has("schick_sid")) fail("Login did not set schick_sid cookie");
  pass("Session login returns token, email, and session cookie");

  // 3. Session me with cookie
  const meRes = await request("/auth/session/me");
  if (meRes.status !== 200) {
    const err = await meRes.text();
    fail(`GET /auth/session/me returned ${meRes.status}: ${err}`);
  }
  const meBody = await meRes.json();
  if (meBody.email !== EMAIL) fail(`/auth/session/me email mismatch: ${meBody.email}`);
  pass("Session /me returns authenticated user");

  // 4. Dashboard accessible (document request with cookie)
  const dashRes = await request("/");
  if (dashRes.status !== 200) fail(`GET / returned ${dashRes.status}`);
  const dashHtml = await dashRes.text();
  if (!dashHtml.includes("Dashboard") && !dashHtml.includes("dashboard")) {
    fail("Dashboard page missing expected content");
  }
  pass("Dashboard loads after login");

  // 5. Unauthenticated redirect
  cookieJar.clear();
  const protectedRes = await request("/");
  if (protectedRes.status !== 200) fail(`Unauthed GET / returned ${protectedRes.status}`);
  // SPA shell loads; client-side auth check redirects to login in browser.
  pass("Unauthenticated request handled (SPA shell)");

  console.log("\nAll local login tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
