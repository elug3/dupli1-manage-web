#!/usr/bin/env node
/**
 * Browser test: the /orders page shows order changes without a reload.
 *
 * Drives the real page against scripts/mock-gateway.mjs, which must be running.
 * Exercises what unit tests cannot: that EventSource actually connects through
 * the session gateway, that a streamed snapshot lands in the table, and that a
 * `reset` frame makes the page reload the list from REST.
 *
 *   node scripts/mock-gateway.mjs &
 *   DUPLI1_GATEWAY_URL=http://localhost:8080 npm run dev &
 *   node scripts/test-order-stream-browser.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5173";
const GATEWAY = process.env.MOCK_GATEWAY_URL ?? "http://localhost:8080";
const EMAIL = process.env.MOCK_ADMIN_EMAIL ?? "admin@dupli1.com";
const PASSWORD = process.env.MOCK_ADMIN_PASSWORD ?? "Dupli1Admin2026!";

let failures = 0;

function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function control(path, body) {
  const res = await fetch(`${GATEWAY}/__control/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`control ${path}: ${res.status}`);
  return res.json();
}

/**
 * Poll the fixture until `predicate` holds. Server-side assertions must not
 * race the browser's own reconnect timing: EventSource waits out its retry
 * delay first, and the pill can still read "Live" from before a drop, so
 * waiting on the UI proves nothing about the connection.
 */
async function waitForState(predicate, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let state = await control("state");
  while (!predicate(state) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    state = await control("state");
  }
  return state;
}

/** Records every toast text; the bar auto-hides after 3s, too fast to poll for. */
const TOAST_RECORDER = () => {
  window.__toasts = [];
  const record = () => {
    for (const el of document.querySelectorAll('[role="alert"]')) {
      const text = (el.textContent || "").trim();
      if (text && !window.__toasts.includes(text)) window.__toasts.push(text);
    }
  };
  const start = () => {
    record();
    new MutationObserver(record).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };
  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start);
};

async function main() {
  await control("seed", {});

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(`console: ${msg.text()}`);
  });
  await page.addInitScript(TOAST_RECORDER);

  console.log(`Live order feed browser test\n  app:     ${BASE}\n  gateway: ${GATEWAY}\n`);

  // ── sign in ───────────────────────────────────────────────────────────────
  // networkidle, not domcontentloaded: the form is React-controlled, so filling
  // it before hydration leaves the DOM values stranded and submits empty state.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });
  console.log("Sign in");
  check("reached the dashboard", true);

  // ── /orders loads the seeded list ─────────────────────────────────────────
  // domcontentloaded here: an open event stream is an in-flight request, so
  // networkidle would never settle on this page.
  await page.goto(`${BASE}/orders`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('tbody tr:has-text("ord_seed_paid")', { timeout: 15000 });
  console.log("\nInitial load");
  check("seeded rows rendered", (await page.locator("tbody tr").count()) === 2);
  // `*_won` fields are whole won: a ₩250,000 item arrives as 250000. This
  // guards the divide-by-100 that the old `*_cents` naming invited.
  const seededRow = await page.textContent('tbody tr:has-text("ord_seed_paid")');
  check(
    "order total is not scaled down by 100",
    seededRow?.includes("250,000"),
    `row="${seededRow?.replace(/\s+/g, " ").trim()}"`
  );

  // ── the stream connects ───────────────────────────────────────────────────
  console.log("\nStream connection");
  await page.waitForSelector('text="Live"', { timeout: 15000 });
  check("page shows the Live pill", true);
  const state = await control("state");
  check("gateway sees an open stream", state.streams >= 1, `streams=${state.streams}`);

  // ── a new order arrives ───────────────────────────────────────────────────
  console.log("\norder.created");
  const created = await control("order", {
    type: "order.created",
    order: { id: "ord_live_new", status: "pending", recipient_name: "Live Arrival" },
  });
  check("event delivered to a client", created.delivered >= 1, `delivered=${created.delivered}`);
  await page.waitForSelector('tbody tr:has-text("ord_live_new")', { timeout: 10000 });
  check("new row appeared without a reload", true);
  check(
    "row count grew to 3",
    (await page.locator("tbody tr").count()) === 3
  );
  const total = await page.textContent("h1 + p");
  check("header count updated", total?.includes("3"), `header="${total?.trim()}"`);
  const toastsAfterCreate = await page.evaluate(() => window.__toasts ?? []);
  check(
    "toast announced the new order",
    toastsAfterCreate.some((t) => t.includes("ord_live_new")),
    JSON.stringify(toastsAfterCreate)
  );

  // ── the same order is paid ────────────────────────────────────────────────
  console.log("\norder.paid");
  await control("order", {
    type: "order.paid",
    order: { id: "ord_live_new", status: "paid", recipient_name: "Live Arrival" },
  });
  const liveRow = page.locator('tbody tr:has-text("ord_live_new")');
  await liveRow.getByText("Paid").waitFor({ timeout: 10000 });
  check("existing row switched to Paid in place", true);
  check(
    "no duplicate row was inserted",
    (await page.locator('tbody tr:has-text("ord_live_new")').count()) === 1
  );

  // ── reset makes the page refetch ──────────────────────────────────────────
  console.log("\nreset");
  const silent = await control("silent-order", {
    order: { id: "ord_never_announced", status: "pending" },
  });
  check(
    "unannounced order is not on screen yet",
    (await page.locator('tbody tr:has-text("ord_never_announced")').count()) === 0,
    `gateway now holds ${silent.order.id}`
  );
  await control("reset", {});
  await page.waitForSelector('tbody tr:has-text("ord_never_announced")', { timeout: 10000 });
  check("reset triggered a full reload from REST", true);

  // ── the stream drops and comes back ───────────────────────────────────────
  // A task restart or a scaling event ends the connection. The browser must
  // reconnect on its own, present its cursor, and take the resync it is given.
  console.log("\nreconnect after a dropped stream");
  const missed = await control("silent-order", {
    order: { id: "ord_after_reconnect", status: "pending" },
  });
  check(
    "order added while the stream is about to die is not on screen",
    (await page.locator('tbody tr:has-text("ord_after_reconnect")').count()) === 0,
    `gateway holds ${missed.order.id}`
  );

  const dropped = await control("drop", {});
  check("stream was dropped server-side", dropped.dropped >= 1, `dropped=${dropped.dropped}`);

  const afterReconnect = await waitForState((state) => state.streams >= 1);
  check("gateway sees the new stream", afterReconnect.streams >= 1, `streams=${afterReconnect.streams}`);
  check(
    "browser presented its cursor on reconnect",
    Boolean(afterReconnect.lastEventIdSeen),
    `Last-Event-ID=${afterReconnect.lastEventIdSeen}`
  );

  await page.waitForSelector('text="Live"', { timeout: 20000 });
  check("pill returned to Live without user action", true);

  await page.waitForSelector('tbody tr:has-text("ord_after_reconnect")', { timeout: 15000 });
  check("what was missed while disconnected is now on screen", true);

  // ── the notification follows the operator, not the page ───────────────────
  // /settings loads no order data at all. A new order must still announce
  // itself there, and it must do so over the same connection — the feed lives
  // in the layout, so navigating must not open a second stream.
  console.log("\napp-wide notification");
  await page.click('a[href="/settings"]');
  await page.waitForURL((url) => url.pathname === "/settings", { timeout: 10000 });
  check("navigated to a page with no order data", true);

  const onSettings = await waitForState((state) => state.streams === 1);
  check(
    "exactly one stream per tab, still open after navigating",
    onSettings.streams === 1,
    `streams=${onSettings.streams}`
  );

  await page.evaluate(() => {
    window.__toasts = [];
  });
  await control("order", {
    type: "order.created",
    order: { id: "ord_elsewhere", status: "pending", recipient_name: "Away From Orders" },
  });
  await page.waitForFunction(
    () => (window.__toasts ?? []).some((text) => text.includes("ord_elsewhere")),
    { timeout: 10000 }
  );
  check("new-order notification shown while on /settings", true, await page.evaluate(() => window.__toasts));

  await page.click('a[href="/orders"]');
  await page.waitForSelector('tbody tr:has-text("ord_elsewhere")', { timeout: 10000 });
  check("the order announced elsewhere is in the table on return", true);
  const backOnOrders = await waitForState((state) => state.streams === 1);
  check(
    "still one stream after navigating back",
    backOnOrders.streams === 1,
    `streams=${backOnOrders.streams}`
  );

  // ── no client-side errors ─────────────────────────────────────────────────
  console.log("\nRuntime");
  check("no page or console errors", pageErrors.length === 0, pageErrors.join(" | "));

  await browser.close();

  console.log(
    failures === 0
      ? "\nAll checks passed."
      : `\n${failures} check(s) failed.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nTest aborted: ${err.message}`);
  process.exit(1);
});
