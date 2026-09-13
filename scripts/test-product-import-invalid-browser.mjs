#!/usr/bin/env node
/**
 * Browser smoke: Import ZIP with invalid catalog masters fails closed.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5173";
const EMAIL = process.env.EMAIL ?? "admin@dupli1.com";
const PASSWORD = process.env.PASSWORD ?? "password";
const ZIP = "/opt/cursor/artifacts/bad-catalog-import.zip";
const OUT = "/opt/cursor/artifacts";
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 20000,
  });

  await page.goto(`${BASE}/products`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Import ZIP");

  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Import ZIP" }).click(),
  ]);
  await fileChooser.setFiles(ZIP);

  await page.waitForSelector("text=Missing catalog master codes", {
    timeout: 30000,
  });
  await page.waitForSelector("text=missing brand ZZ");

  const importBtn = page.getByRole("button", { name: "Import", exact: true });
  await importBtn.waitFor({ state: "visible" });
  const disabled = await importBtn.isDisabled();
  if (!disabled) {
    throw new Error("Import button should be disabled when masters are missing");
  }

  const shot = `${OUT}/products_import_invalid_catalog.png`;
  await page.screenshot({ path: shot, fullPage: false });
  console.log("PASS: invalid catalog codes block import");
  console.log(`screenshot: ${shot}`);

  await browser.close();
}

main().catch((err) => {
  console.error("FAIL:", err.message ?? err);
  process.exit(1);
});
