#!/usr/bin/env node
/**
 * Browser test: the /support inbox with a web consultation.
 *
 * Drives the real page against scripts/mock-gateway.mjs, which must be running:
 * the channel filter, the context panel (product, purchase history), a reply
 * carrying an order card, and the live stream reloading the transcript; then
 * the 상품 문의 tab: queue, context, a templated answer, hiding, deep links.
 *
 *   node scripts/mock-gateway.mjs &
 *   DUPLI1_GATEWAY_URL=http://localhost:8080 npm run dev &
 *   node scripts/test-support-browser.mjs
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

async function control(path, body) {
  const res = await fetch(`${GATEWAY}/__control/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`control ${path}: ${res.status}`);
  return res.json();
}

async function main() {
  await control("support-seed");
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

  console.log("Channel filter");
  await page.goto(`${BASE}/support?channel=web`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=shopper@example.com", { timeout: 15000 });
  const listText = await page.textContent("ul");
  check("web filter lists the web consultation", listText?.includes("shopper@example.com"));
  check("web filter hides Telegram", !listText?.includes("tg_shopper"));

  console.log("\nContext panel");
  await page.click("text=shopper@example.com");
  const panel = page.getByRole("complementary", { name: "고객 정보" });
  await panel.waitFor({ timeout: 15000 });
  const aside = (await panel.textContent()) ?? "";
  check("names the shopper", aside.includes("shopper@example.com"));
  check("shows the product asked about", aside.includes("Eco Bag") && aside.includes("재고 3"), aside.slice(0, 200));
  check("says they bought it before", aside.includes("구매한 적이 있습니다"));
  check("counts paid orders only", aside.includes("2건"));
  check("sums lifetime spend", aside.includes("500,000"));
  check("never shows a phone or address", !/010-|주소/.test(aside));
  check("transcript shows the product card", (await page.locator("ol a", { hasText: "Eco Bag" }).count()) > 0);

  console.log("\nLive stream");
  await page.waitForSelector('text="Live"', { timeout: 15000 });
  check("Live pill", true);
  await control("support-message", { body: "혹시 그린도 있나요?" });
  await page.waitForSelector("text=혹시 그린도 있나요?", { timeout: 10000 });
  check("a new shopper message appears without a reload", true);

  console.log("\nReply with an order card");
  const attach = page.getByLabel("카드 첨부");
  const options = await attach.locator("option").allTextContents();
  check("offers the product and the shopper's orders", options.some((o) => o.startsWith("상품")) && options.filter((o) => o.startsWith("주문")).length === 3, options.join(" | "));
  await attach.selectOption({ label: options.find((o) => o.startsWith("주문")) });
  await page.fill("textarea", "주문하신 그린 가방은 배송 중입니다.");
  await page.click('button[value="reply"]');
  await page.waitForSelector("text=주문하신 그린 가방은 배송 중입니다.", { timeout: 10000 });
  check("reply text in transcript", true);
  check("order card sent with it", (await page.locator("ol a", { hasText: /^주문 ord_web_/ }).count()) > 0);

  await control("support-message", { body: "감사합니다", read: true });
  await page.waitForSelector("text=감사합니다", { timeout: 10000 });
  check("replies show 읽음 once read", (await page.locator("ol", { hasText: "읽음" }).count()) > 0);

  console.log("\nProduct questions");
  await page.goto(`${BASE}/support?tab=questions`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=노트북 15인치 들어가나요?", { timeout: 15000 });
  const queueText = (await page.textContent("ul")) ?? "";
  check("waiting queue lists the unanswered question", queueText.includes("노트북"));
  check("waiting queue leaves out the answered one", !queueText.includes("그린 재입고"));
  await page.click("text=노트북 15인치 들어가나요?");
  const qPanel = page.getByRole("complementary", { name: "고객 정보" });
  await qPanel.waitFor({ timeout: 15000 });
  const qAside = (await qPanel.textContent()) ?? "";
  check("context names the shopper", qAside.includes("shopper@example.com"));
  check("context shows the product", qAside.includes("Eco Bag"));
  check("shows the shopper's fit", ((await page.textContent("section")) ?? "").includes("165cm"));
  await page.getByLabel("답변 템플릿").selectOption({ label: "상품 정보" });
  const templated = await page.getByLabel("답변", { exact: true }).inputValue();
  check("template fills the answer", templated.startsWith("안녕하세요, DUPLI1입니다."));
  await page.getByLabel("답변", { exact: true }).fill("15인치까지 들어갑니다.");
  await page.click('button[value="answer"]');
  await page.waitForSelector("text=답변 · usr_mock_admin", { timeout: 10000 });
  check("answer saved and shown", (await page.locator("text=15인치까지 들어갑니다.").count()) > 0);
  await page.click('button[value="hide"]');
  await page.waitForSelector('button[value="unhide"]', { timeout: 10000 });
  await page.goto(`${BASE}/support?tab=questions&queue=hidden`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=노트북 15인치 들어가나요?", { timeout: 15000 });
  check("hidden question is in the hidden queue", true);
  await page.goto(`${BASE}/support?tab=questions&question=pq_2`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=다음 주 입고 예정입니다.", { timeout: 15000 });
  check("a ?question= link opens that question", true);

  if (SCREENSHOT) await page.screenshot({ path: SCREENSHOT, fullPage: true });
  check("no page errors", pageErrors.length === 0, pageErrors.join("; "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
