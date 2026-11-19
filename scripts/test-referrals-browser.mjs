#!/usr/bin/env node
/**
 * Browser test: the /referrals page (secret referral codes and the monthly
 * commission report, dupli1 docs/product-referral-codes.md).
 *
 * Drives the real page against scripts/mock-gateway.mjs, which must be running:
 *
 *   node scripts/mock-gateway.mjs &
 *   DUPLI1_GATEWAY_URL=http://localhost:8080 npm run dev &
 *   node scripts/test-referrals-browser.mjs
 *
 * SCREENSHOT_DIR saves the page and the editor (English and Korean).
 */
import { chromium } from "playwright";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5173";
const GATEWAY = process.env.MOCK_GATEWAY_URL ?? "http://localhost:8080";
const EMAIL = process.env.MOCK_ADMIN_EMAIL ?? "admin@dupli1.com";
const PASSWORD = process.env.MOCK_ADMIN_PASSWORD ?? "Dupli1Admin2026!";
const SHOTS = process.env.SCREENSHOT_DIR;

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function stored(code) {
  const res = await fetch(`${GATEWAY}/api/v1/products/promotions`);
  return ((await res.json()).results ?? []).find((p) => p.code === code);
}

async function main() {
  await fetch(`${GATEWAY}/__control/promotions-reset`, { method: "POST" });
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

  console.log("Promotional codes leave referral codes out");
  await page.goto(`${BASE}/promotions`, { waitUntil: "load" });
  await page.getByText("WINTER10").first().waitFor({ timeout: 15000 });
  check("/promotions does not list HUH15", !(await page.locator("main").textContent()).includes("HUH15"));

  console.log("\nCodes");
  await page.getByRole("link", { name: "Referral codes" }).click();
  await page.waitForURL((url) => url.pathname === "/referrals", { timeout: 15000 });
  const rows = page.getByTestId("referral-row");
  await rows.first().waitFor({ timeout: 15000 });
  const huh = rows.filter({ hasText: "HUH15" });
  check("HUH15 is listed with its referrer", (await huh.textContent()).includes("허경호"));
  check("…15% off and 5% commission", /15%.*5%/.test(await huh.textContent()));
  check("WINTER10 is not a referral code", (await rows.filter({ hasText: "WINTER10" }).count()) === 0);

  console.log("\nCreate one");
  await page.getByRole("button", { name: "New referral code" }).click();
  const editor = page.getByTestId("referral-editor");
  await editor.waitFor();
  check("commission defaults to 5%", (await page.locator("#ref-commission").inputValue()) === "5");
  await page.fill("#ref-code", "kim10");
  await editor.getByRole("button", { name: "Create code" }).click();
  check("a missing referrer is refused", (await editor.textContent()).includes("Enter the referrer's name"));
  await page.fill("#ref-referrer", "김지인");
  await page.fill("#ref-percent", "10");
  await page.fill("#ref-commission", "3.5");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/referrals-editor-en.png`, fullPage: true });
  await editor.getByRole("button", { name: "Create code" }).click();
  await editor.waitFor({ state: "detached", timeout: 10000 });
  const kim = await stored("KIM10");
  check("created as a global referral code", kim?.kind === "referral" && kim?.scope === "global");
  check("…with the referrer and 350 bps", kim?.referrer_name === "김지인" && kim?.commission_bps === 350);
  check("…with no shopper-facing text", !kim?.description && !kim?.terms);
  check("the row appears", (await rows.filter({ hasText: "KIM10" }).textContent()).includes("3.5%"));

  console.log("\nEdit");
  await huh.getByRole("button", { name: "Edit" }).click();
  await editor.waitFor();
  check("the code cannot be changed", await page.locator("#ref-code").isDisabled());
  await page.fill("#ref-commission", "7");
  await editor.getByRole("button", { name: "Save" }).click();
  await editor.waitFor({ state: "detached", timeout: 10000 });
  check("the new rate is saved", (await stored("HUH15"))?.commission_bps === 700);
  check("the kind is untouched", (await stored("HUH15"))?.kind === "referral");

  console.log("\nCommission report");
  const report = page.getByTestId("commission-report");
  const statement = report.getByTestId("referrer-statement").first();
  await statement.waitFor({ timeout: 15000 });
  check("two orders fulfilled this month", (await report.getByTestId("statement-line").count()) === 2);
  // 1,258,000 × 5% = 62,900; income tax 1,880, local 180; net 60,840.
  check("net after 3.3% is ₩60,840", (await statement.getByTestId("statement-net").textContent()).includes("60,840"));
  check("the withholding is split", (await statement.textContent()).includes("1,880") && (await statement.textContent()).includes("180"));
  check("the open order is shown apart", (await statement.getByTestId("statement-open").textContent()).includes("1"));
  check("the refunded order is not listed", !(await report.textContent()).includes("ord_ref_refunded"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/referrals-en.png`, fullPage: true });

  await report.getByRole("button", { name: "Previous month" }).click();
  await report.getByText("ord_ref_prev").waitFor({ timeout: 10000 });
  check("last month has its one order", (await report.getByTestId("statement-line").count()) === 1);
  check("…₩85,000 commission", (await report.textContent()).includes("85,000"));
  check("the month is in the URL", /month=\d{4}-\d{2}/.test(new URL(page.url()).search));
  const download = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  await report.getByRole("button", { name: "Download CSV" }).click();
  const file = await download;
  check("the CSV downloads", Boolean(file) && /referral-commission-\d{4}-\d{2}\.csv/.test(file?.suggestedFilename() ?? ""));

  await report.getByRole("button", { name: "Previous month" }).click();
  await report.getByText("ord_ref_prev").waitFor({ state: "detached", timeout: 10000 });
  check("a month with nothing fulfilled has no lines", (await report.getByTestId("statement-line").count()) === 0);
  check("…but still shows the open order", (await report.getByTestId("statement-open").count()) === 1);

  console.log("\nKorean");
  await page.context().addCookies([{ name: "dupli1_locale", value: "ko", url: BASE }]);
  await page.goto(`${BASE}/referrals`, { waitUntil: "load" });
  await page.getByTestId("referrer-statement").first().waitFor({ timeout: 15000 });
  check("the page is in Korean", (await page.locator("h1").textContent()).includes("추천 코드"));
  check("the report says 지급액", (await page.getByTestId("commission-report").textContent()).includes("지급액"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/referrals-ko.png`, fullPage: true });
  await page.context().addCookies([{ name: "dupli1_locale", value: "en", url: BASE }]);

  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  await browser.close();
  await fetch(`${GATEWAY}/__control/promotions-reset`, { method: "POST" });
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
