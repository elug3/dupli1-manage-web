#!/usr/bin/env node
/**
 * Browser smoke: PDP single-product Export ZIP.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5173";
const EMAIL = process.env.EMAIL ?? "admin@dupli1.com";
const PASSWORD = process.env.PASSWORD ?? "password";
const OUT = "/opt/cursor/artifacts";
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const downloads = [];
  page.on("download", (d) => downloads.push(d));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 20000,
  });

  await page.goto(`${BASE}/products`, { waitUntil: "networkidle" });
  // Prefer a seeded transfer product with images when present
  const transferRow = page
    .locator("table tbody tr")
    .filter({ hasText: "Transfer" })
    .first();
  if ((await transferRow.count()) > 0) {
    await Promise.all([
      page.waitForURL(/\/products\//, { timeout: 15000 }),
      transferRow.click(),
    ]);
  } else {
    const firstRow = page.locator("table tbody tr").first();
    await Promise.all([
      page.waitForURL(/\/products\//, { timeout: 15000 }),
      firstRow.click(),
    ]);
  }
  await page.waitForSelector('button:has-text("Export ZIP")');

  const before = `${OUT}/pdp_export_button.png`;
  await page.screenshot({ path: before, fullPage: false });
  console.log(`screenshot: ${before}`);

  await page.getByRole("button", { name: "Export ZIP" }).click();

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && downloads.length === 0) {
    await page.waitForTimeout(300);
  }
  if (downloads.length === 0) {
    throw new Error("PDP Export ZIP did not download");
  }
  const dl = downloads[0];
  const name = dl.suggestedFilename() || "pdp-export.zip";
  const savePath = `${OUT}/${name}`;
  await dl.saveAs(savePath);

  await page.waitForSelector("text=Product exported", { timeout: 10000 });
  const after = `${OUT}/pdp_export_done.png`;
  await page.screenshot({ path: after, fullPage: false });
  console.log(`PASS: downloaded ${savePath}`);
  console.log(`screenshot: ${after}`);

  await browser.close();
}

main().catch((err) => {
  console.error("FAIL:", err.message ?? err);
  process.exit(1);
});
