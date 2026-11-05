#!/usr/bin/env node
/**
 * Browser test: a SKU's second color (color2Code) on /products/{id}/SKU/{sku}.
 *
 * Drives the real page against scripts/mock-gateway.mjs, which must be running:
 *
 *   node scripts/mock-gateway.mjs &
 *   DUPLI1_GATEWAY_URL=http://localhost:8080 npm run dev &
 *   node scripts/test-sku-second-color-browser.mjs
 *
 * SCREENSHOT_PATH saves a screenshot of the second color section.
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

  await page.goto(`${BASE}/products/prod_mock_eco/SKU/DUP_ECO01_BLK_OS`, { waitUntil: "domcontentloaded" });
  const select = page.locator("select#color2Code");
  await select.waitFor({ timeout: 15000 });
  const swatch = page.locator("[data-swatch]");
  const save = page.getByRole("button", { name: "Save second color" });

  console.log("One color");
  await eventually(async () => (await select.locator("option").count()) > 1);
  const options = await select.locator("option").evaluateAll((os) => os.map((o) => o.value));
  check("offers none plus every color but the first", options[0] === "" && !options.includes("BLK") && options.includes("GRN"), options.join(","));
  check("swatch is solid", (await swatch.getAttribute("data-swatch")) === "solid");
  check("save is disabled until something changes", await save.isDisabled());

  console.log("\nSet a second color");
  await select.selectOption("GRN");
  await save.click();
  check(
    "the SKU shows its second color",
    await eventually(async () => (await page.getByText("Second color updated for DUP_ECO01_BLK_OS").count()) > 0)
  );
  check(
    "swatch becomes two-tone",
    await eventually(async () => (await swatch.getAttribute("data-swatch")) === "two-tone")
  );
  check("the select keeps GRN", (await select.inputValue()) === "GRN");
  check("the SKU code is unchanged", (await page.locator("h1").textContent())?.trim() === "DUP_ECO01_BLK_OS");
  if (SCREENSHOT) {
    await page.locator("section", { hasText: "Second color" }).first().screenshot({ path: SCREENSHOT });
  }

  console.log("\nClear it");
  await select.selectOption("");
  await save.click();
  check(
    "swatch is solid again",
    await eventually(async () => (await swatch.getAttribute("data-swatch")) === "solid")
  );
  check("the select shows one color", (await select.inputValue()) === "");

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
