#!/usr/bin/env node
/**
 * Browser check: upload several SKU images in a chosen order, then reorder
 * the gallery.
 *
 * Drives the SKU detail page against scripts/mock-gateway.mjs, which must be
 * running, as must the dev server pointed at it:
 *
 *   node scripts/mock-gateway.mjs &
 *   npm run dev &
 *   node scripts/test-product-images-browser.mjs
 *
 * Picks 10.png, 2.png and 1.png together (the queue sorts them 1, 2, 10),
 * moves 10 to the front, uploads, and expects the variant to hold 10, 1, 2:
 * the mock appends with a read-modify-write, so this also fails if the
 * console uploads in parallel. Then drags the last image to the front and
 * expects the saved order to follow.
 */
import { chromium } from "playwright";
import { deflateSync } from "node:zlib";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5173";
const GATEWAY = process.env.MOCK_GATEWAY_URL ?? "http://localhost:8080";
const EMAIL = process.env.MOCK_ADMIN_EMAIL ?? "admin@dupli1.com";
const PASSWORD = process.env.MOCK_ADMIN_PASSWORD ?? "Dupli1Admin2026!";
const PRODUCT = "prod_mock_eco";
const SKU = "DUP_ECO01_NAT_OS";
const SKU_ID = "sku_eco_nat";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** A 32×32 PNG of one colour. */
function png([r, g, b]) {
  const size = 32;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(size).fill([r, g, b]).flat())]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(Array(size).fill(row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function variantImages() {
  const res = await fetch(`${GATEWAY}/api/v1/products/${PRODUCT}`);
  const product = await res.json();
  const v = product.variants.find((x) => x.sku === SKU);
  return v.imageUrls.map((u) => decodeURIComponent(u.split("/").at(-1)).replace(/^\d+-/, ""));
}

function expectOrder(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: expected ${expected.join(", ")}, got ${actual.join(", ")}`);
  }
  console.log(`ok: ${what} = ${actual.join(", ")}`);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"));

  await page.goto(`${BASE}/products/${PRODUCT}/SKU/${SKU_ID}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add images" }).waitFor();

  await page.locator('input[type="file"][multiple]').setInputFiles([
    { name: "10.png", mimeType: "image/png", buffer: png([200, 30, 30]) },
    { name: "2.png", mimeType: "image/png", buffer: png([30, 160, 30]) },
    { name: "1.png", mimeType: "image/png", buffer: png([30, 30, 200]) },
  ]);
  const queue = page.locator("ol").last();
  const queued = async () =>
    queue.locator("li").evaluateAll((lis) => lis.map((li) => li.querySelector("img")?.alt));
  expectOrder(await queued(), ["1.png", "2.png", "10.png"], "queue sorted by name");

  const moveEarlier = (i) => queue.locator("li").nth(i).getByRole("button", { name: "Move earlier" });
  await moveEarlier(2).click();
  await moveEarlier(1).click();
  expectOrder(await queued(), ["10.png", "1.png", "2.png"], "queue after moving 10 first");

  await page.getByRole("button", { name: "Upload 3 images" }).click();
  await page.getByText("3 images uploaded").waitFor();
  expectOrder(await variantImages(), ["10.png", "1.png", "2.png"], "uploaded order");

  const gallery = page.locator("ol").first();
  await gallery.locator("li img").first().waitFor();
  await page.screenshot({ path: process.env.SCREENSHOT ?? "/tmp/product-images-uploaded.png" });

  await gallery.locator("li").nth(2).dragTo(gallery.locator("li").nth(0));
  await page.getByText("Image order saved").waitFor();
  expectOrder(await variantImages(), ["2.png", "10.png", "1.png"], "order after drag");

  await gallery.locator("li").nth(0).getByRole("button", { name: "Move later" }).click();
  await page.getByText("Image order saved").last().waitFor();
  await page.waitForTimeout(300);
  expectOrder(await variantImages(), ["10.png", "2.png", "1.png"], "order after arrow");

  await browser.close();
  console.log("PASS");
}

main().catch((err) => {
  console.error("FAIL:", err.message ?? err);
  process.exit(1);
});
