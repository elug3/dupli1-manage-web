#!/usr/bin/env node
/**
 * Browser test: color swatch fill (hex, one color per row) on /catalog → Colors.
 *
 * Drives the real page against scripts/mock-gateway.mjs, which must be running:
 *
 *   node scripts/mock-gateway.mjs &
 *   DUPLI1_GATEWAY_URL=http://localhost:8080 npm run dev &
 *   node scripts/test-color-swatches-browser.mjs
 *
 * SCREENSHOT_PATH saves a screenshot of the colors panel.
 */
import { chromium } from "playwright";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5173";
const EMAIL = process.env.MOCK_ADMIN_EMAIL ?? "admin@dupli1.com";
const PASSWORD = process.env.MOCK_ADMIN_PASSWORD ?? "Dupli1Admin2026!";
const SCREENSHOT = process.env.SCREENSHOT_PATH;

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function eventually(fn, timeout = 10000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });

  await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Colors" }).click();
  const row = (code) => page.locator("tbody tr", { hasText: code });
  await page.waitForSelector("text=#0a0a0a", { timeout: 15000 });

  console.log("List");
  check("a color shows its hex", ((await row("BLK").textContent()) ?? "").includes("#0a0a0a"));
  check("a color without a hex says so", ((await row("OLV").textContent()) ?? "").includes("No swatch color"));

  console.log("\nEdit");
  await row("BLK").getByRole("button", { name: "Edit" }).click();
  const hexInputs = row("BLK").locator('input[placeholder="#rrggbb"]');
  check("one swatch field (no second color)", (await hexInputs.count()) === 1);
  await hexInputs.first().fill("111111");
  await row("BLK").getByRole("button", { name: "Save" }).click();
  check(
    "saving stores the fill, normalized",
    await eventually(async () => ((await row("BLK").textContent()) ?? "").includes("#111111"))
  );

  console.log("\nValidation");
  await row("GRN").getByRole("button", { name: "Edit" }).click();
  await row("GRN").locator('input[placeholder="#rrggbb"]').first().fill("green");
  await row("GRN").getByRole("button", { name: "Save" }).click();
  check(
    "a malformed hex is refused in the console",
    await eventually(async () => (await page.getByText("Enter colors as #rrggbb.").count()) > 0)
  );
  await row("GRN").getByRole("button", { name: "Cancel" }).click();
  check("GRN keeps its hex", ((await row("GRN").textContent()) ?? "").includes("#3f6b4a"));

  console.log("\nCreate");
  const form = page.locator("form").first();
  await form.locator('input[placeholder]').first().fill("BGB");
  await form.locator("input").nth(1).fill("Bisque");
  check("create has one swatch field", (await form.locator('input[placeholder="#rrggbb"]').count()) === 1);
  await form.locator('input[placeholder="#rrggbb"]').first().fill("#d8c3a5");
  await form.getByRole("button", { name: "Add" }).click();
  check(
    "a new color is listed with its fill",
    await eventually(async () => ((await row("BGB").textContent().catch(() => "")) ?? "").includes("#d8c3a5"))
  );

  if (SCREENSHOT) {
    await page.locator("table").first().screenshot({ path: SCREENSHOT });
  }
  check("no page errors", pageErrors.length === 0, pageErrors.join("; "));
  await browser.close();
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
