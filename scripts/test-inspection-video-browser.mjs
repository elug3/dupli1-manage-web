#!/usr/bin/env node
/**
 * Browser test: the order page's inspection video (검수영상) card.
 *
 * Drives the real page against scripts/mock-gateway.mjs, which must be running:
 * Ship stays disabled until a video is attached, a wrong file type is refused
 * in the browser, the upload goes through the session gateway with progress,
 * the video plays back (and seeks by byte range) through the same gateway, it
 * can be replaced, the order ships, and the video locks once fulfilled.
 *
 *   node scripts/mock-gateway.mjs &
 *   DUPLI1_GATEWAY_URL=http://localhost:8080 npm run dev &
 *   node scripts/test-inspection-video-browser.mjs
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

async function control(path, body) {
  const res = await fetch(`${GATEWAY}/__control/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`control ${path}: ${res.status}`);
  return res.json();
}

/** A real, playable WebM recorded in the page (no ffmpeg needed). */
async function recordWebm(page) {
  const b64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(15);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start(100);
    let frame = 0;
    const timer = setInterval(() => {
      ctx.fillStyle = `hsl(${(frame++ * 20) % 360} 70% 50%)`;
      ctx.fillRect(0, 0, 160, 90);
    }, 66);
    await new Promise((r) => setTimeout(r, 1200));
    rec.stop();
    await stopped;
    clearInterval(timer);
    const buf = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
    let s = "";
    for (const b of buf) s += String.fromCharCode(b);
    return btoa(s);
  });
  return Buffer.from(b64, "base64");
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });

  const { order } = await control("silent-order", {
    order: {
      id: `ord_video_${Date.now()}`,
      status: "confirmed",
      paid_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    },
  });

  console.log("1. A confirmed order without a video cannot ship");
  // The console holds the live order stream open, so networkidle never settles.
  await page.goto(`${BASE}/orders/${order.id}`, { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("inspection-video");
  await card.waitFor({ timeout: 15000 });
  const ship = page.getByRole("button", { name: "Ship", exact: true });
  check("Ship is disabled", await ship.isDisabled());
  check("hint explains why", await page.getByTestId("ship-needs-video").isVisible());
  check("card asks for the video", (await card.textContent()).includes("Required to ship"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-empty.png`, fullPage: true });

  console.log("2. A file that is not a video is refused before uploading");
  let putCount = 0;
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().includes("/inspection-video")) putCount += 1;
  });
  await page.getByTestId("inspection-video-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a video"),
  });
  await card.getByRole("alert").waitFor({ timeout: 5000 });
  check("type error shown", (await card.getByRole("alert").textContent()).includes("MP4, MOV or WebM"));
  check("nothing was uploaded", putCount === 0);

  console.log("3. Upload a real video");
  const webm = await recordWebm(page);
  check("recorded a test video", webm.length > 1000, `${webm.length} bytes`);
  await page.getByTestId("inspection-video-input").setInputFiles({
    name: "inspection_1106.webm",
    mimeType: "video/webm",
    buffer: webm,
  });
  const player = page.getByTestId("inspection-video-player");
  await player.waitFor({ timeout: 15000 });
  check("upload went through the session gateway", putCount === 1);
  check("card shows Attached", (await card.textContent()).includes("Attached"));
  check("Ship is enabled", !(await ship.isDisabled()));
  check("hint is gone", (await page.getByTestId("ship-needs-video").count()) === 0);
  const ready = await player.evaluate(
    (v) =>
      new Promise((resolve) => {
        if (v.readyState >= 1) return resolve(v.readyState);
        v.addEventListener("loadedmetadata", () => resolve(v.readyState), { once: true });
        v.addEventListener("error", () => resolve(-1), { once: true });
        setTimeout(() => resolve(v.readyState), 8000);
      })
  );
  check("video plays back through the gateway", ready >= 1, `readyState ${ready}`);
  const src = await player.getAttribute("src");
  const ranged = await page.evaluate(async (url) => {
    const res = await fetch(url, { headers: { Range: "bytes=0-9" }, credentials: "include" });
    return { status: res.status, length: (await res.arrayBuffer()).byteLength };
  }, src);
  check("byte ranges reach the order service", ranged.status === 206 && ranged.length === 10, JSON.stringify(ranged));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-attached.png`, fullPage: true });

  console.log("4. Replace it");
  await page.getByTestId("inspection-video-input").setInputFiles({
    name: "retake.webm",
    mimeType: "video/webm",
    buffer: webm,
  });
  await page.waitForFunction(
    (old) => document.querySelector('[data-testid="inspection-video-player"]')?.getAttribute("src") !== old,
    src,
    { timeout: 15000 }
  );
  check("player switched to the new upload", putCount === 2);

  console.log("5. Ship");
  await ship.click();
  await page.fill('input[autocomplete="off"]', "123456789012");
  await page.getByRole("button", { name: "Confirm ship" }).click();
  await page.waitForFunction(() => document.body.textContent.includes("In transit"), null, { timeout: 15000 });
  check("order shipped", true);
  check("video still replaceable in transit", (await card.getByRole("button", { name: "Replace video" }).count()) === 1);

  console.log("6. Fulfilled locks it");
  await control("order-status", { id: order.id, status: "fulfilled" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await card.waitFor({ timeout: 15000 });
  check("card shows Locked", (await card.textContent()).includes("Locked"));
  check("no replace button", (await card.getByRole("button", { name: "Replace video" }).count()) === 0);
  check("player still there", (await player.count()) === 1);

  console.log("7. Korean copy");
  await context.addCookies([{ name: "dupli1_locale", value: "ko", url: BASE }]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await card.waitFor({ timeout: 15000 });
  check("Korean title", (await card.textContent()).includes("검수영상"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-locked-ko.png`, fullPage: true });

  await browser.close();
  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll inspection video checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
