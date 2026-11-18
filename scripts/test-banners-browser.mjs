#!/usr/bin/env node
/**
 * Browser test: the /banners page (storefront image banners).
 *
 * Drives the real page against scripts/mock-gateway.mjs, which must be running:
 *
 *   node scripts/mock-gateway.mjs &
 *   DUPLI1_GATEWAY_URL=http://localhost:8080 npm run dev &
 *   node scripts/test-banners-browser.mjs
 *
 * SCREENSHOT_DIR saves the list and the editor (English and Korean).
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

async function liveBanners() {
  const res = await fetch(`${GATEWAY}/api/v1/products/banners?placement=home_hero`);
  return (await res.json()).banners ?? [];
}

/** Renders a simple picture to PNG bytes, so the test needs no fixture files. */
async function makeImage(browser, width, height, label, colors) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<body style="margin:0;width:${width}px;height:${height}px;background:linear-gradient(135deg,${colors});display:flex;align-items:flex-end;justify-content:flex-end;font:600 ${Math.round(height / 12)}px sans-serif;color:rgba(255,255,255,.55)"><span style="padding:4%">${label}</span></body>`
  );
  const buffer = await page.screenshot({ type: "png" });
  await page.close();
  return { name: `${label.toLowerCase().replace(/\s+/g, "-")}.png`, mimeType: "image/png", buffer };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const desktop = await makeImage(browser, 1500, 600, "Winter edit", "#2b3a4a,#8a9bb0 60%,#d9cbb8");
  const phone = await makeImage(browser, 540, 675, "Winter phone", "#3b2b4a,#b08a9b 60%,#d9cbb8");

  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });

  console.log("Navigation");
  await page.getByRole("link", { name: "Banners" }).click();
  await page.waitForURL((url) => url.pathname === "/banners", { timeout: 15000 });
  await page.getByTestId("home-status").waitFor({ timeout: 15000 });
  check("the home status says the video plays", (await page.getByTestId("home-status").textContent()).includes("built-in video"));
  const before = await page.getByTestId("banner-row").count();

  console.log("\nCreate a banner");
  await page.getByRole("button", { name: "New banner" }).click();
  const editor = page.getByTestId("banner-editor");
  await editor.waitFor();
  await editor.getByRole("button", { name: "Create banner" }).click();
  check("saving without an image is refused", (await editor.textContent()).includes("Upload a desktop image"));

  await page.getByTestId("desktop-image").locator('input[type="file"]').setInputFiles(desktop);
  await page.getByTestId("desktop-image").locator("img").waitFor({ timeout: 10000 });
  await page.getByTestId("mobile-image").locator('input[type="file"]').setInputFiles(phone);
  await page.getByTestId("mobile-image").locator("img").waitFor({ timeout: 10000 });
  check("both images uploaded", (await editor.locator("img").count()) >= 2);

  await page.getByTestId("title-ko").fill("겨울 컬렉션");
  await editor.getByPlaceholder("e.g. Shop now").fill("지금 쇼핑하기");
  await page.getByTestId("link-url").fill("javascript:alert(1)");
  await editor.getByRole("button", { name: "Create banner" }).click();
  check("an unsafe link is refused", (await editor.textContent()).includes("must start with / or https://"));
  await page.getByTestId("link-url").fill("/category/product-type/handbags");
  check("the preview shows the title", (await page.getByTestId("preview").textContent()).includes("겨울 컬렉션"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/banners-editor-en.png`, fullPage: true });

  await editor.getByRole("button", { name: "Create banner" }).click();
  await page.getByTestId("banner-editor").waitFor({ state: "detached", timeout: 10000 });
  const rows = page.getByTestId("banner-row");
  check("the new banner is listed", (await rows.count()) === before + 1);
  const row = rows.filter({ hasText: "겨울 컬렉션" });
  check("it starts hidden", (await row.textContent()).includes("Hidden"));
  check("nothing is live yet", (await liveBanners()).length === 0);

  console.log("\nShow it");
  await row.getByRole("button", { name: "Show" }).click();
  await row.getByText("On the storefront").waitFor({ timeout: 10000 });
  check("the home status names it", (await page.getByTestId("home-status").textContent()).includes("겨울 컬렉션"));
  const live = await liveBanners();
  check("the storefront read returns it", live.length === 1 && live[0].title.ko === "겨울 컬렉션");
  check("it carries the phone image", Boolean(live[0]?.mobile_image_url));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/banners-list-en.png`, fullPage: true });

  console.log("\nKorean");
  await page.context().addCookies([{ name: "dupli1_locale", value: "ko", url: BASE }]);
  await page.reload({ waitUntil: "load" });
  await page.getByTestId("banner-row").first().waitFor();
  check("the page is in Korean", (await page.locator("h1").textContent()).includes("배너"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/banners-list-ko.png`, fullPage: true });
  await page.getByTestId("banner-row").filter({ hasText: "겨울 컬렉션" }).getByRole("button", { name: "편집" }).click();
  await page.getByTestId("banner-editor").waitFor();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/banners-editor-ko.png`, fullPage: true });
  await page.context().addCookies([{ name: "dupli1_locale", value: "en", url: BASE }]);
  await page.reload({ waitUntil: "load" });

  console.log("\nTake it down and delete it");
  const again = page.getByTestId("banner-row").filter({ hasText: "겨울 컬렉션" });
  await again.waitFor();
  await again.getByRole("button", { name: "Take down" }).click();
  await again.getByText("Hidden").waitFor({ timeout: 10000 });
  check("taking it down empties the storefront read", (await liveBanners()).length === 0);
  await again.getByRole("button", { name: "Delete" }).click();
  await again.getByRole("button", { name: "Delete" }).last().click();
  await again.waitFor({ state: "detached", timeout: 10000 });
  check("delete removes the row", (await page.getByTestId("banner-row").count()) === before);

  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
