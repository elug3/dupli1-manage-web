#!/usr/bin/env node
/**
 * Browser smoke: Products Export ZIP / Import ZIP controls.
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

  console.log(`Open ${BASE}/login`);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 20000,
  });

  await page.goto(`${BASE}/products`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Export ZIP");
  await page.waitForSelector("text=Import ZIP");

  const headerShot = `${OUT}/products_export_import_buttons.png`;
  await page.screenshot({ path: headerShot, fullPage: false });
  console.log("PASS: Export ZIP and Import ZIP visible");
  console.log(`screenshot: ${headerShot}`);

  page.once("dialog", async (dialog) => {
    console.log(`dialog: ${dialog.message()}`);
    await dialog.accept();
  });

  await page.getByRole("button", { name: "Export ZIP" }).click();

  // Wait for download or error toast
  const deadline = Date.now() + 60000;
  let gotDownload = false;
  while (Date.now() < deadline) {
    if (downloads.length > 0) {
      gotDownload = true;
      break;
    }
    const err = await page
      .locator("text=/Export failed|Failed|master/i")
      .first()
      .isVisible()
      .catch(() => false);
    if (err) break;
    await page.waitForTimeout(500);
  }

  const afterShot = `${OUT}/products_export_after.png`;
  await page.screenshot({ path: afterShot, fullPage: false });
  console.log(`screenshot: ${afterShot}`);

  if (gotDownload) {
    const dl = downloads[0];
    const suggested = dl.suggestedFilename();
    const savePath = `${OUT}/${suggested || "export.zip"}`;
    await dl.saveAs(savePath);
    console.log(`PASS: downloaded ${savePath}`);
  } else {
    const body = await page.locator("body").innerText();
    console.log("WARN: no download; page text snippet:");
    console.log(body.slice(0, 800));
    throw new Error("Export ZIP did not produce a download");
  }

  await browser.close();
  console.log("Browser transfer UI test passed.");
}

main().catch((err) => {
  console.error("FAIL:", err.message ?? err);
  process.exit(1);
});
