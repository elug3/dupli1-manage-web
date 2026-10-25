#!/usr/bin/env node
/**
 * Browser test: the payment kill switches section of /settings.
 *
 * Drives the real page against scripts/mock-gateway.mjs, which must be running:
 *
 *   node scripts/mock-gateway.mjs &
 *   DUPLI1_GATEWAY_URL=http://localhost:8080 npm run dev &
 *   node scripts/test-kill-switches-browser.mjs
 *
 * SCREENSHOT_PATH saves a full-page screenshot with card payments blocked.
 */
import { chromium } from "playwright";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5173";
const GATEWAY = process.env.MOCK_GATEWAY_URL ?? "http://localhost:8080";
const EMAIL = process.env.MOCK_ADMIN_EMAIL ?? "admin@dupli1.com";
const PASSWORD = process.env.MOCK_ADMIN_PASSWORD ?? "Dupli1Admin2026!";
const SCREENSHOT = process.env.SCREENSHOT_PATH;

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function methods() {
  const res = await fetch(`${GATEWAY}/api/v1/payments/methods`);
  return (await res.json()).methods;
}

async function main() {
  await fetch(`${GATEWAY}/__control/kill-switches-reset`, { method: "POST" });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });

  console.log("Navigation");
  check("the sidebar has no Kill switches link", (await page.getByRole("link", { name: "Kill switches" }).count()) === 0);
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForURL((url) => url.pathname === "/settings", { timeout: 15000 });
  const panel = page.locator("#kill-switches");
  const card = panel.locator("section", { has: page.getByRole("heading", { name: "Credit card payments" }) });
  await card.waitFor({ timeout: 15000 });
  check("settings has the Kill switches section", (await panel.getByRole("heading", { name: "Kill switches" }).count()) === 1);
  check("both switches are listed", (await panel.locator("section").count()) === 2);
  check("card starts accepting payments", (await card.textContent()).includes("Accepting payments"));

  console.log("\nBlock card payments");
  await card.getByLabel("Message to shoppers").fill("카드 결제 점검 중입니다");
  await card.getByLabel("Reason (staff only)").fill("NANO incident");
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Block Credit card payments" }).click();
  await card.getByText("Blocked", { exact: true }).waitFor({ timeout: 10000 });
  const blockedText = await card.textContent();
  check("the card shows the shopper message", blockedText.includes("카드 결제 점검 중입니다"));
  check("the card shows the reason", blockedText.includes("NANO incident"));
  check("the card says who blocked it", blockedText.includes(`Blocked by ${EMAIL}`));
  const card1 = (await methods()).find((m) => m.method === "credit_card");
  check("checkout sees card as unavailable", card1.available === false && card1.message === "카드 결제 점검 중입니다");
  const bypass = (await methods()).find((m) => m.method === "bypass");
  check("bypass is untouched", bypass.available === true);
  if (SCREENSHOT) await page.screenshot({ path: SCREENSHOT, fullPage: true });

  console.log("\nCancelling the confirm changes nothing");
  page.once("dialog", (d) => d.dismiss());
  await card.getByRole("button", { name: "Turn Credit card payments back on" }).click();
  await page.waitForTimeout(500);
  check("still blocked", (await methods()).find((m) => m.method === "credit_card").disabled === true);

  console.log("\nTurn card back on");
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Turn Credit card payments back on" }).click();
  await card.getByText("Accepting payments").waitFor({ timeout: 10000 });
  check("checkout sees card again", (await methods()).find((m) => m.method === "credit_card").available === true);
  check("the card says who turned it back on", (await card.textContent()).includes("Last turned back on by"));

  console.log("\nOld link");
  await page.goto(`${BASE}/kill-switches`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === "/settings", { timeout: 15000 });
  check("/kill-switches redirects to the settings section", new URL(page.url()).hash === "#kill-switches");

  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  await browser.close();
  if (failures > 0) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
