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

  console.log("\nCode detail page");
  await page.goto(`${BASE}/referrals`, { waitUntil: "load" });
  await rows.first().waitFor({ timeout: 15000 });
  await rows.filter({ hasText: "HUH15" }).getByRole("link", { name: "HUH15" }).click();
  await page.waitForURL((url) => url.pathname === "/referrals/HUH15", { timeout: 15000 });
  const detail = page.getByTestId("referral-detail");
  await detail.getByTestId("code-order").first().waitFor({ timeout: 15000 });
  check("the header names the referrer", (await detail.textContent()).includes("허경호"));
  const stats = await detail.getByTestId("code-stats").textContent();
  check("5 paid orders: 3 fulfilled, 1 open, 1 canceled", stats.includes("5") && stats.includes("3 fulfilled · 1 open · 1 canceled"));
  check("2 customers, the refunded one left out", /Customers\s*2/.test(stats));
  // 850,000 + 408,000 + 1,700,000 at 5% (the rate on the orders, not today's 7%)
  check("₩147,900 earned, ₩12,750 waiting", stats.includes("147,900") && stats.includes("12,750"));
  const settings = await detail.getByTestId("code-settings").textContent();
  check("settings show today's 7% rate", settings.includes("7% of goods after discount"));
  check("…and unlimited uses", settings.includes("Unlimited per shopper"));
  const months = detail.getByTestId("code-month");
  check("two months earned", (await months.count()) === 2);
  check("this month nets ₩60,840", (await months.first().getByTestId("code-month-net").textContent()).includes("60,840"));
  check("last month nets ₩82,200", (await months.nth(1).getByTestId("code-month-net").textContent()).includes("82,200"));
  check("the newest month is marked so far", (await months.first().textContent()).includes("so far"));
  const orderRows = detail.getByTestId("code-order");
  check("every paid order is listed", (await orderRows.count()) === 5);
  const refunded = orderRows.filter({ hasText: "ord_ref_refunded" });
  check("the refunded order earns ₩0", (await refunded.getByTestId("code-order-commission").textContent()).includes("0") && (await refunded.textContent()).includes("refunded"));
  await detail.getByRole("tab", { name: /^Open/ }).click();
  await page.waitForURL((url) => url.searchParams.get("show") === "open");
  await orderRows.nth(1).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  check("the Open filter shows the order in transit", (await orderRows.count()) === 1 && (await orderRows.first().textContent()).includes("ord_ref_open"));
  await detail.getByRole("tab", { name: /^All/ }).click();
  const codeCsv = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  await detail.getByTestId("code-orders").getByRole("button", { name: "Download CSV" }).click();
  check("the orders CSV downloads", (await codeCsv)?.suggestedFilename() === "referral-HUH15-orders.csv");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/referral-detail-en.png`, fullPage: true });

  await detail.getByRole("button", { name: "Turn off" }).click();
  await detail.getByTestId("turn-off-confirm").getByRole("button", { name: "Turn off" }).click();
  await detail.getByRole("button", { name: "Turn back on" }).waitFor({ timeout: 10000 });
  check("turning off saves active false", (await stored("HUH15"))?.active === false);
  check("…and keeps the rate", (await stored("HUH15"))?.commission_bps === 700);
  check("the badge says Off", (await detail.getByTestId("code-status").first().textContent()) === "Off");
  await detail.getByRole("button", { name: "Turn back on" }).click();
  await detail.getByRole("button", { name: "Turn off" }).waitFor({ timeout: 10000 });
  check("turning back on saves active true", (await stored("HUH15"))?.active === true);

  await detail.getByRole("button", { name: "Edit code" }).click();
  await page.getByTestId("referral-editor").waitFor();
  await page.fill("#ref-referrer", "허경호 (KH)");
  await page.getByTestId("referral-editor").getByRole("button", { name: "Save" }).click();
  await page.getByTestId("referral-editor").waitFor({ state: "detached", timeout: 10000 });
  check("editing from the detail page saves", (await stored("HUH15"))?.referrer_name === "허경호 (KH)");
  check("…and earlier orders keep their name", (await detail.textContent()).includes("Earlier orders were placed under 허경호"));

  await page.goto(`${BASE}/referrals/NOPE99`, { waitUntil: "load" });
  await page.getByTestId("referral-not-found").waitFor({ timeout: 15000 });
  check("an unknown code says so", (await page.getByTestId("referral-not-found").textContent()).includes("NOPE99"));

  await page.goto(`${BASE}/referrals?month=2000-01`, { waitUntil: "load" });
  await page.getByTestId("referrer-statement").first().waitFor({ timeout: 15000 });
  await page.getByTestId("referrer-statement").first().getByRole("link", { name: "HUH15" }).click();
  await page.waitForURL((url) => url.pathname === "/referrals/HUH15", { timeout: 15000 });
  check("a statement links to its code", true);

  console.log("\nKorean");
  await page.context().addCookies([{ name: "dupli1_locale", value: "ko", url: BASE }]);
  await page.goto(`${BASE}/referrals`, { waitUntil: "load" });
  await page.getByTestId("referrer-statement").first().waitFor({ timeout: 15000 });
  check("the page is in Korean", (await page.locator("h1").textContent()).includes("추천 코드"));
  check("the report says 지급액", (await page.getByTestId("commission-report").textContent()).includes("지급액"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/referrals-ko.png`, fullPage: true });
  await page.goto(`${BASE}/referrals/HUH15`, { waitUntil: "load" });
  await page.getByTestId("code-order").first().waitFor({ timeout: 15000 });
  check("the detail page is in Korean", (await page.getByTestId("code-settings").textContent()).includes("고객당 무제한"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/referral-detail-ko.png`, fullPage: true });
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
