#!/usr/bin/env node
/**
 * Smoke-test product ZIP transfer against the local gateway.
 * Seeds masters + a product with an image, then exports/imports via the
 * manage-web Phase 1 ZIP format (manifest.json + images/).
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";

const BASE = process.env.BASE || "http://localhost:8080";
const EMAIL = process.env.EMAIL || "admin@dupli1.com";
const PASS = process.env.PASSWORD || "password";

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function json(method, path, body, token) {
  const headers = { Accept: "application/json" };
  if (body != null) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (res.status === 502 && attempt < 5) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        const err = new Error(`${method} ${path} → ${res.status}: ${text}`);
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (err.status && err.status !== 502) throw err;
      if (attempt < 5) {
        await sleep(300 * (attempt + 1));
        continue;
      }
    }
  }
  throw lastErr;
}

async function login() {
  const loginBody = await json("POST", "/api/v1/auth/login", {
    email: EMAIL,
    password: PASS,
  });
  const refreshed = await json("POST", "/api/v1/auth/refresh", {
    refresh_token: loginBody.refresh_token,
  });
  return refreshed.token;
}

function normalize(code) {
  return String(code || "")
    .trim()
    .toUpperCase();
}

/** Minimal valid 1×1 PNG */
function tinyPng() {
  return Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    )
  );
}

async function ensureMaster(token, kind, code, name, brandCode) {
  const paths = {
    brand: "/api/v1/products/catalog/brands",
    color: "/api/v1/products/catalog/colors",
    size: "/api/v1/products/catalog/sizes",
    style: `/api/v1/products/catalog/brands/${encodeURIComponent(brandCode)}/styles`,
  };
  try {
    await json("POST", paths[kind], { code, name }, token);
  } catch (err) {
    if (!String(err.message).includes("409") && !String(err.message).includes("already")) {
      // ignore exists; rethrow unexpected
      if (!/409|exists|conflict/i.test(String(err.message))) {
        console.warn(`ensure ${kind} ${code}:`, err.message);
      }
    }
  }
}

async function uploadVariantImage(token, productId, sku, bytes, filename) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/png" }), filename);
    const res = await fetch(
      `${BASE}/api/v1/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(sku)}/images`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }
    );
    if (res.status === 502 && attempt < 4) {
      await sleep(300 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      lastErr = new Error(`upload → ${res.status}: ${await res.text()}`);
      if (attempt < 4) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      throw lastErr;
    }
    return res.json();
  }
  throw lastErr;
}

async function main() {
  const token = await login();
  console.log("logged in");

  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const brandCode = "TR";
  const styleCode = `S${stamp}`;
  const styleCodeImport = `I${stamp}`;
  const colorCode = "BLK";
  const sizeCode = "OS";

  await ensureMaster(token, "brand", brandCode, "Transfer Brand");
  await ensureMaster(token, "color", colorCode, "Black");
  await ensureMaster(token, "size", sizeCode, "One Size");
  await ensureMaster(token, "style", styleCode, `Style ${stamp}`, brandCode);
  await ensureMaster(
    token,
    "style",
    styleCodeImport,
    `Import style ${stamp}`,
    brandCode
  );

  const parent = await json(
    "POST",
    "/api/v1/products",
    {
      name: `Transfer Seed ${stamp}`,
      brandCode,
      styleCode,
      material: "Leather",
      category: "bags",
      status: "active",
      price: 1200000,
      officialPrice: 1500000,
      description: "smoke seed",
    },
    token
  );
  console.log("seed parent", parent.id);

  const variant = await json(
    "POST",
    `/api/v1/products/${encodeURIComponent(parent.id)}/variants`,
    { colorCode, sizeCode, status: "active" },
    token
  );
  console.log("seed variant", variant.sku);

  await uploadVariantImage(
    token,
    parent.id,
    variant.sku,
    tinyPng(),
    "seed.png"
  );

  const detail = await json(
    "GET",
    `/api/v1/products/${encodeURIComponent(parent.id)}`,
    null,
    token
  );
  const v0 = (detail.variants || [])[0];
  if (!v0?.imageUrls?.length) {
    throw new Error("seed variant has no imageUrls after upload");
  }

  // Build export ZIP (as manage-web would)
  const files = {};
  const images = [];
  for (let i = 0; i < v0.imageUrls.length; i++) {
    const url = v0.imageUrls[i];
    const res = await fetch(url.startsWith("http") ? url : `${BASE}${url}`);
    if (!res.ok) throw new Error(`download image ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const rel = `images/${parent.id}/${v0.sku}/${i}.png`;
    files[rel] = buf;
    images.push(rel);
  }

  const manifest = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source: "smoke-product-transfer",
    products: [
      {
        name: `Transfer Import ${stamp}`,
        brandCode,
        styleCode: styleCodeImport,
        material: "Leather",
        category: "bags",
        description: "imported via zip",
        status: "draft",
        price: 1200000,
        officialPrice: 1500000,
        variants: [
          {
            colorCode,
            sizeCode,
            status: "active",
            images,
            exportedSku: v0.sku,
            exportedSkuId: v0.skuId,
          },
        ],
        exportedId: parent.id,
      },
    ],
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  const zipped = zipSync(files);
  const unzipped = unzipSync(zipped);
  const parsed = JSON.parse(strFromU8(unzipped["manifest.json"]));
  if (parsed.schemaVersion !== 1) throw new Error("bad schemaVersion");

  // Simulate invalid catalog code rejection path
  let invalidRejected = false;
  try {
    await json(
      "POST",
      "/api/v1/products",
      {
        name: "bad",
        brandCode: "ZZ",
        styleCode: "NOPE",
        material: "x",
        category: "bags",
      },
      token
    );
  } catch (err) {
    invalidRejected = /404|master|not found|missing/i.test(err.message);
  }
  if (!invalidRejected) {
    throw new Error("expected invalid catalog codes to be rejected");
  }

  const created = await json(
    "POST",
    "/api/v1/products",
    {
      name: parsed.products[0].name,
      brandCode: parsed.products[0].brandCode,
      styleCode: parsed.products[0].styleCode,
      material: parsed.products[0].material,
      category: parsed.products[0].category,
      description: parsed.products[0].description,
      status: "draft",
      price: parsed.products[0].price,
      officialPrice: parsed.products[0].officialPrice,
    },
    token
  );

  let uploaded = 0;
  for (const v of parsed.products[0].variants) {
    const createdVariant = await json(
      "POST",
      `/api/v1/products/${encodeURIComponent(created.id)}/variants`,
      {
        colorCode: v.colorCode,
        sizeCode: v.sizeCode,
        status: v.status || "active",
      },
      token
    );
    for (const rel of v.images || []) {
      const bytes = unzipped[rel];
      if (!bytes) continue;
      await uploadVariantImage(
        token,
        created.id,
        createdVariant.sku,
        bytes,
        rel.split("/").pop()
      );
      uploaded += 1;
    }
  }

  const imported = await json(
    "GET",
    `/api/v1/products/${encodeURIComponent(created.id)}`,
    null,
    token
  );
  const imageCount = (imported.variants || []).reduce(
    (n, v) => n + (v.imageUrls?.length || 0),
    0
  );

  const summary = {
    ok: true,
    seedId: parent.id,
    importedId: created.id,
    styleCodeImport,
    imagesUploaded: uploaded,
    imagesOnImported: imageCount,
    invalidCatalogRejected: invalidRejected,
    zipBytes: zipped.byteLength,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (uploaded < 1 || imageCount < 1) {
    throw new Error("import did not retain images");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
