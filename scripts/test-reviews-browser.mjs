#!/usr/bin/env node
/**
 * Browser test: staff review moderation at /reviews.
 *
 *   node scripts/mock-gateway.mjs &
 *   DUPLI1_GATEWAY_URL=http://localhost:8080 npm run dev -- --port 5174 &
 *   TEST_BASE_URL=http://localhost:5174 node scripts/test-reviews-browser.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5174";
const GATEWAY = process.env.MOCK_GATEWAY_URL ?? "http://localhost:8080";
const EMAIL = process.env.MOCK_ADMIN_EMAIL ?? "admin@dupli1.com";
const PASSWORD = process.env.MOCK_ADMIN_PASSWORD ?? "Dupli1Admin2026!";

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  await fetch(`${GATEWAY}/__control/reviews-reset`, { method: "POST" });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Dupli1 Admin" }).waitFor();
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });

  console.log("List");
  await page.getByRole("link", { name: "Reviews" }).click();
  await page.waitForURL((url) => url.pathname === "/reviews", { timeout: 15000 });
  await page.getByRole("heading", { name: "Reviews" }).waitFor();
  await page.getByText("가죽 결이 곱고 사이즈도 적당해요.").waitFor();
  check("both seeded reviews are visible", (await page.getByTestId("review-card").count()) === 2);

  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.SCREENSHOT_MOBILE) await page.screenshot({ path: process.env.SCREENSHOT_MOBILE, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  console.log("\nFilters");
  await page.getByLabel("Rating").selectOption("1");
  await page.waitForURL((url) => url.searchParams.get("rating") === "1");
  await page.locator('[data-review-id="rev_good"]').waitFor({ state: "detached" });
  check("rating filter keeps the 1-star review", (await page.getByTestId("review-card").count()) === 1);
  await page.getByLabel("Rating").selectOption("");
  await page.waitForURL((url) => !url.searchParams.has("rating"));
  await page.locator('[data-review-id="rev_good"]').waitFor();
  check("clearing the rating shows both", (await page.getByTestId("review-card").count()) === 2);

  const productFilter = page.getByPlaceholder("Product id");
  await productFilter.fill("prod_mock_eco");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL((url) => url.searchParams.get("productId") === "prod_mock_eco");
  await page.locator('[data-review-id="rev_low"]').waitFor({ state: "detached" });
  check("product filter keeps the Eco Bag review", (await page.getByTestId("review-card").count()) === 1);
  await productFilter.fill("missing");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL((url) => url.searchParams.get("productId") === "missing");
  await page.getByText("No reviews match.").waitFor();
  check("unknown product is an empty list", (await page.getByTestId("review-card").count()) === 0);
  await productFilter.fill("");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL((url) => !url.searchParams.has("productId"));
  await page.getByText("배송은 왔는데 마감이 거칠어요.").waitFor();

  console.log("\nHide and unhide");
  const low = page.locator('[data-review-id="rev_low"]');
  await low.getByLabel("Reason").fill("마감 불량");
  await low.getByRole("button", { name: "Hide" }).click();
  await low.waitFor({ state: "detached", timeout: 10000 });
  check("hiding removes it from the visible list", (await page.getByTestId("review-card").count()) === 1);
  if (process.env.SCREENSHOT_DESKTOP) await page.screenshot({ path: process.env.SCREENSHOT_DESKTOP, fullPage: true });

  await page.getByLabel("Status").selectOption("hidden");
  await page.getByText("Hidden: 마감 불량").waitFor();
  check("the hidden list shows the reason", (await page.getByTestId("review-card").count()) === 1);
  if (process.env.SCREENSHOT_HIDDEN) await page.screenshot({ path: process.env.SCREENSHOT_HIDDEN, fullPage: true });
  await page.getByRole("button", { name: "Unhide" }).click();
  await page.getByText("No reviews match.").waitFor();

  await page.getByLabel("Status").selectOption("visible");
  await page.getByText("배송은 왔는데 마감이 거칠어요.").waitFor();
  check("unhiding puts it back on the visible list", (await page.getByTestId("review-card").count()) === 2);

  console.log("\nKorean");
  await page.context().addCookies([{ name: "dupli1_locale", value: "ko", url: BASE }]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "리뷰" }).waitFor();
  check("the page follows the Korean locale", (await page.getByRole("link", { name: "리뷰" }).count()) === 1);

  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  await browser.close();
  if (failures) {
    console.log(`\n${failures} failed`);
    process.exit(1);
  }
  console.log("\nall passed");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
