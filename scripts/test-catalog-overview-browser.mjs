#!/usr/bin/env node
/**
 * Browser test: the catalog overview (/catalog/overview) and the /products
 * filters its numbers link to.
 *
 * Drives the real page against scripts/mock-gateway.mjs, which must be running:
 *
 *   node scripts/mock-gateway.mjs &
 *   DUPLI1_GATEWAY_URL=http://localhost:8080 npm run dev &
 *   node scripts/test-catalog-overview-browser.mjs
 *
 * SCREENSHOT_PATH saves a full-page screenshot of the overview.
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

/** Polls fn until it returns true or the timeout passes. */
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });

  console.log("Overview");
  await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Overview" }).click();
  await page.waitForURL((url) => url.pathname === "/catalog/overview", { timeout: 15000 });
  await page.waitForSelector("text=By brand", { timeout: 15000 });
  const body = (await page.textContent("main")) ?? (await page.textContent("body")) ?? "";
  check("tiles show the totals", body.includes("Units in stock") && body.includes("129"), "129 products");
  check("an empty brand master is listed", body.includes("Fendi"));
  check("a brand outside the masters is badged", body.includes("Not in masters"));
  check("products without a subcategory are flagged", body.includes("1 product has no subcategory"));

  const prada = page.getByRole("link", { name: "Prada" }).first();
  check("a brand links to its product list by code", (await prada.getAttribute("href")) === "/products?brand_code=PRD");
  const cell = page.locator('a[href="/products?category=bags&subcategory=tote&brand_code=PRD"]');
  check("a grid cell links to brand × subcategory", (await cell.count()) === 1);
  check("the Prada × Tote cell reads 5", ((await cell.textContent()) ?? "").trim() === "5");
  if (SCREENSHOT) await page.screenshot({ path: SCREENSHOT, fullPage: true });

  console.log("\nCount by and status");
  await page.getByRole("button", { name: "Units in stock" }).click();
  await page.waitForURL((url) => url.searchParams.get("by") === "units");
  check(
    "count-by switches the grid to units",
    await eventually(async () => ((await cell.textContent()) ?? "").trim() === "160")
  );
  await page.getByLabel("Status").selectOption("draft");
  await page.waitForURL((url) => url.searchParams.get("status") === "draft");
  const draftCell = page.locator('a[href="/products?category=bags&subcategory=handbags&brand_code=PRD&status=draft"]');
  check("status narrows the counts and carries into links", await eventually(async () => (await draftCell.count()) === 1));
  check(
    "the draft units are counted",
    await eventually(async () => ((await draftCell.textContent()) ?? "").trim() === "30")
  );

  console.log("\nProducts filters");
  await page.goto(`${BASE}/products?category=bags&subcategory=tote&brand_code=DUP`, { waitUntil: "domcontentloaded" });
  const sub = page.getByLabel("Subcategory");
  await sub.waitFor({ timeout: 15000 });
  check("subcategory filter reads the URL", (await sub.inputValue()) === "tote");
  check(
    "brand filter reads brand_code",
    await eventually(async () => (await page.getByLabel("Brand").inputValue()) === "DUP")
  );
  await page.getByRole("button", { name: "Clothing" }).click();
  await page.waitForURL((url) => url.searchParams.get("category") === "clothing");
  check("changing category clears the subcategory", new URL(page.url()).searchParams.get("subcategory") === null);

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
