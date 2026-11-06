#!/usr/bin/env node
/**
 * Browser test: /catalog → Colors. The "needs base color" filter, the base
 * color picker with its storefront preview, "Save & next unset", clearing a
 * base color, a color's own fill (hex, one color per row) and creating a
 * color with a base color.
 *
 * Drives the real page against scripts/mock-gateway.mjs, which must be running:
 *
 *   node scripts/mock-gateway.mjs &
 *   DUPLI1_GATEWAY_URL=http://localhost:8080 npm run dev &
 *   node scripts/test-color-swatches-browser.mjs
 *
 * SCREENSHOT_PATH saves a screenshot of the Colors tab.
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

  await page.goto(`${BASE}/catalog`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Colors", exact: true }).click();
  const row = (code) => page.locator("tbody tr", { hasText: code });
  const rowText = async (code) => (await row(code).textContent().catch(() => "")) ?? "";
  const editor = page.getByRole("region", { name: "Edit color" });
  const unsetCount = async () => ((await page.getByTestId("unset-count").textContent()) ?? "").replace(/\D/g, "");
  const preview = async () => (await page.getByTestId("storefront-preview").textContent()) ?? "";
  await page.waitForSelector("text=쇼어", { timeout: 15000 });

  console.log("Needs base color");
  check("opens on colors without a base color", (await row("SHR").count()) === 1 && (await row("BLK").count()) === 0);
  check("counts them", (await unsetCount()) === "2", await unsetCount());
  check("marks them not set", (await rowText("OPL")).includes("Not set"));

  console.log("\nPick a base color");
  await row("SHR").getByRole("button", { name: "Set base SHR" }).click();
  check("the editor opens on the color", ((await editor.textContent()) ?? "").includes("쇼어"));
  check("offers every base color", (await editor.locator("button[aria-pressed]").count()) === 8);
  check("previews no fill before a base", (await preview()).includes("“no color”"));
  await editor.getByRole("button", { name: /^Beige/ }).click();
  check("previews the base fill", (await preview()).includes("the Beige fill"), await preview());
  check("previews the filter", (await preview()).includes("under the Beige filter"));
  await editor.getByRole("button", { name: "Save & next unset" }).click();
  check(
    "saving drops it from the list",
    await eventually(async () => (await row("SHR").count()) === 0 && (await unsetCount()) === "1")
  );
  check("moves to the next unset color", await eventually(async () => ((await editor.textContent()) ?? "").includes("오팔린")));

  console.log("\nOwn fill");
  await editor.getByRole("button", { name: /^Grey/ }).click();
  await editor.getByLabel("Own fill (#rrggbb)").fill("green");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  check(
    "a malformed fill is refused",
    await eventually(async () => (await page.getByText("Enter colors as #rrggbb.").count()) > 0)
  );
  await editor.getByLabel("Own fill (#rrggbb)").fill("8E8E8E");
  check("an own fill wins in the preview", (await preview()).includes("its own fill"));
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  check(
    "the last one saved empties the filter",
    await eventually(async () => (await page.getByText("Every color has a base color.").count()) > 0)
  );
  check("the fill was stored normalized", (await editor.getByLabel("Own fill (#rrggbb)").inputValue()) === "#8e8e8e");

  console.log("\nAll colors");
  await page.getByRole("button", { name: /^All colors/ }).click();
  check("lists every color", (await row("BLK").count()) === 1);
  check("shows a base color by name and code", (await rowText("SHR")).includes("Beige · BGE"), await rowText("SHR"));
  await page.getByRole("searchbox").fill("오팔");
  check("search narrows by name", (await page.locator("tbody tr").count()) === 1 && (await row("OPL").count()) === 1);
  await page.getByRole("searchbox").fill("");

  console.log("\nClear a base color");
  await row("SHR").getByRole("button", { name: "Edit SHR" }).click();
  await editor.getByRole("button", { name: "Clear base color" }).click();
  check("previews no filter", (await preview()).includes("aren't under any base-color filter"));
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  check(
    "clearing marks it not set again",
    await eventually(async () => (await rowText("SHR")).includes("Not set") && (await unsetCount()) === "1")
  );

  console.log("\nCreate");
  const form = page.getByRole("form", { name: "Add color" });
  await form.getByLabel("Code").fill("BGB");
  await form.getByLabel("Display name").fill("Bisque");
  await form.getByLabel("Base color").selectOption("BGE");
  await form.getByLabel("Own fill (#rrggbb)").fill("#d8c3a5");
  await form.getByRole("button", { name: "Add" }).click();
  check(
    "a new color is listed with its base color",
    await eventually(async () => (await rowText("BGB")).includes("Beige · BGE"))
  );

  if (SCREENSHOT) {
    await row("BLK").click();
    await page.locator("main").screenshot({ path: SCREENSHOT });
  }
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
