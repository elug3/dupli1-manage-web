# Product import / export (with images)

Plan for admin **export** and **import** of parent products + variants **including image files** in `dupli1-manage-web`.

Related contracts: [CLAUDE.md](../CLAUDE.md) (product / image APIs), backend [product-sku-system.md](../../dupli1/docs/product-sku-system.md), [product-sku-master-data-plan.md](../../dupli1/docs/product-sku-master-data-plan.md).

---

## Goal

Operators can:

1. **Export** selected or filtered catalog products to a downloadable package that includes metadata **and** image binaries.
2. **Import** that package (or an equivalently structured package) to recreate products in another environment (local ↔ prod backup, staging seed, bulk onboarding).

No backend bulk endpoint exists today. v1 is **client-orchestrated** over existing REST APIs.

---

## Current building blocks (already in manage-web)

| Need | Existing API helper |
|------|---------------------|
| List / detail | `searchProducts`, `getProductDetail` |
| Create parent | `createProductParent` (requires existing `brandCode` + `styleCode`) |
| Create variant | `createVariant` (requires existing `colorCode` + `sizeCode`) |
| Upload images | `uploadProductImage`, `uploadVariantImage` (multipart `image`, max 50 MiB) |
| Masters | `list*` / `createBrand` / `createStyle` / `createColor` / `createSize` / `createEdition` |
| Same-origin image GET | `productImageSrc` + `/product-images/*` proxy |

Identity constraints that shape the package:

- Parent `id` and variant `skuId` are **ULIDs generated on create** — not portable as write keys.
- Human identity is **`brandCode` + `styleCode`** (one style → one product; unique pair).
- Human variant `sku` is composed from masters and is **immutable after create**.
- Image URLs in the API are storage/CDN locations; export must **embed files**, not rely on absolute URLs surviving across envs.

---

## Recommended package format

**ZIP** containing a JSON manifest + an `images/` tree. Prefer ZIP over CSV: nested variants, attributes maps, and binary images fit poorly in a flat spreadsheet.

```text
dupli1-products-v1.zip
├── manifest.json
└── images/
    └── {brandCode}_{styleCode}/
        ├── parent/                 # optional default-variant / parent uploads
        │   └── 001.jpg
        └── variants/
            └── {colorCode}_{sizeCode}[_edition]/
                ├── 001.jpg
                └── 002.webp
```

### `manifest.json` (v1 schema sketch)

```json
{
  "format": "dupli1-products",
  "version": 1,
  "exportedAt": "2026-08-29T00:00:00.000Z",
  "source": { "gatewayHint": "optional opaque string" },
  "masters": {
    "brands": [{ "code": "BOT", "name": "Bottega Veneta" }],
    "styles": [{ "brandCode": "BOT", "code": "CAS001", "name": "Cassette" }],
    "colors": [{ "code": "BLK", "name": "Black" }],
    "sizes": [{ "code": "OS", "name": "One Size" }],
    "editions": []
  },
  "products": [
    {
      "brandCode": "BOT",
      "styleCode": "CAS001",
      "name": "Cassette",
      "category": "bags",
      "material": "leather",
      "description": "…",
      "status": "active",
      "price": 3900000,
      "officialPrice": 4200000,
      "subCategory": "handbags",
      "style": "casual",
      "target": "women",
      "attributes": { "lining": "suede" },
      "parentImages": ["images/BOT_CAS001/parent/001.jpg"],
      "variants": [
        {
          "colorCode": "BLK",
          "sizeCode": "OS",
          "editionCode": "",
          "status": "active",
          "dimensions": { "widthMm": 230, "heightMm": 150, "depthMm": 50 },
          "images": ["images/BOT_CAS001/variants/BLK_OS/001.jpg"]
        }
      ],
      "exportMeta": {
        "sourceProductId": "01J…",
        "sourceSkus": [{ "sku": "BOT_CAS001_BLK_OS", "skuId": "01J…" }]
      }
    }
  ]
}
```

Rules:

- Paths in `parentImages` / `images` are **ZIP-relative**.
- `exportMeta` is informational only (audit / debug); import **must not** require source ULIDs.
- Omit inventory quantities in v1 (inventory is a separate service); optional later field `initialStock` if we wire `setInventory` like `products.new`.

Dependency: add a small ZIP helper (e.g. `fflate` or `jszip`) — none in `package.json` today.

---

## Export (manage-web)

### UX

On `/products` header (next to **New product**):

- **Export** — exports current filter result, or checked rows if we add selection later.
- Progress toast / panel: “Fetching 12/40… bundling images…”.

Start with **export current search result** (cap, e.g. 100 products) to avoid huge ZIPs; add “export selected” when row checkboxes exist.

### Algorithm

1. Resolve product ids from current list query (`searchProducts`) or selection.
2. For each id, `getProductDetail` (full `variants[]` + image URL lists).
3. Collect referenced master codes; fetch names via catalog list APIs into `masters`.
4. For each image URL: `fetch(productImageSrc(url), { credentials: "include" })` → blob → write under `images/…` with stable sequential names.
5. Build `manifest.json`; ZIP; trigger browser download (`dupli1-products-YYYYMMDD.zip`).

### Failure modes

- Missing/broken image URL → record warning in a `warnings[]` sidecar or skip that file and note in UI; still export metadata.
- CORS / proxy: always use same-origin rewritten URLs (`productImageSrc`), never raw gateway/MinIO hosts from the browser.
- CloudFront URLs (`images.dupli1.com`) are already absolute public CDN — fetch as-is when not gateway-rewritable.

---

## Import (manage-web)

### UX

On `/products`: **Import** opens a panel/modal:

1. Choose `.zip` file.
2. Parse + validate schema (`format` + `version`).
3. Show summary: N products, M variants, K images; list blocking errors (unknown schema, empty products).
4. Options:
   - **Create missing masters** (default on) — needs `product.master.write`.
   - **On existing `brandCode`+`styleCode`:** `skip` (default) | `fail` | `update` (phase 2).
5. Run import with a live log (per product: created / skipped / error).

### Algorithm (create mode)

For each product in order:

1. Ensure masters exist (create brand/style/color/size/edition if opted-in and missing).
2. If a product already exists for `brandCode`+`styleCode` → apply conflict policy (`skip` / `fail`).
3. `createProductParent` with merchandising + price fields.
4. Optionally `updateProduct` for fields not accepted on create (`subCategory`, `style`, `target`, `attributes`) if create payload is narrower than update — match whatever `products.new` / detail edit already send.
5. For each variant: `createVariant` → for each image file: `uploadVariantImage` (or `uploadProductImage` for parent-level gallery / first default variant, matching create-product flow).
6. Continue on per-product errors; accumulate a final report (downloadable JSON optional).

### Permissions

| Action | Permission |
|--------|------------|
| Export | `product.read` (+ image GET via session gateway) |
| Import create | `product.create`, `product.image.upload` |
| Create masters | `product.master.write` |
| Update existing (phase 2) | `product.update` (and variant update if needed) |

Hide/disable Import when the session lacks create/upload.

### Non-goals for v1

- Atomic all-or-nothing transaction (no backend bulk API).
- Preserving source ULIDs / human `sku` strings when masters differ.
- Replacing images on existing variants without an explicit update mode.
- CSV-only import (can add a thin CSV→manifest converter later if merchandisers demand Excel).
- Coupons, orders, inventory reservations.

---

## Implementation slices

### Phase 0 — Spec lock (this doc)

- Agree on ZIP + `manifest.json` version 1.
- Agree create-only import + skip-on-conflict.
- No backend changes.

### Phase 1 — Export with images

| Area | Work |
|------|------|
| `app/lib/product-package.ts` | Types, validateManifest, buildExportManifest, zip helpers |
| `app/lib/api.ts` | Thin helpers only if needed (e.g. list details in parallel with concurrency limit) |
| `app/routes/products.tsx` | Export button + progress |
| i18n `en` / `ko` / `zh-CN` | Export strings |
| Deps | Add ZIP library |

### Phase 2 — Import create-only

| Area | Work |
|------|------|
| Same `product-package.ts` | unzip, validate, resolve masters, runImport |
| UI | Import modal on `/products` |
| i18n | Import strings + error messages |
| Edge | Cap concurrent uploads; surface partial success |

### Phase 3 — Upsert / update (optional)

- Match by `brandCode`+`styleCode`.
- `updateProduct` for parent fields; add missing variants by color/size/edition; append images via upload (do not wipe galleries unless user opts in).
- Still no ULID rewrite.

### Phase 4 — Backend bulk (only if needed)

If catalogs grow large (timeouts, memory, reliability), add something like:

- `POST /api/v1/products/import` (multipart ZIP) and/or
- `GET /api/v1/products/export?…` (stream ZIP)

Requires `dupli1` product service work + OpenAPI. Prefer staying client-side until Phase 1–2 prove painful.

---

## UI placement (preserve admin patterns)

Keep the existing products page composition: title + actions row. Secondary actions (**Export** / **Import**) as outline buttons beside the primary **New product** accent button — not a new nav item, not cards in a hero.

Reuse existing form/button classes (`rounded-xl`, `border-edge`, `bg-accent`) and `useNotify` for completion/errors.

---

## Testing

1. **Round-trip local:** create product with variant image → export ZIP → wipe or use another style code / empty DB → import → PDP shows same fields + images.
2. **Master gap:** import with unknown `colorCode` and “create masters” off → clear error; on → color created then product succeeds.
3. **Conflict:** import twice with skip → second run reports skipped, no duplicate.
4. **Broken image in ZIP:** product still created; warning for that file.
5. `npm run typecheck`.

Manual QA against Docker gateway (`DUPLI1_GATEWAY_URL`); login `admin@dupli1.com` / `password`.

---

## Open decisions (confirm before coding)

1. **Selection model for export:** current filters only, or add row checkboxes in the same PR?
2. **Default conflict policy:** skip vs fail?
3. **Auto-create masters:** default on or off?
4. **Inventory:** include optional `initialStock` per variant in v1?
5. **Ship Phase 1 only first**, or Phase 1+2 in one PR?

---

## Suggested first PR (implementation)

After this plan is accepted: implement **Phase 1 (export)** + **Phase 2 create-only import** in one feature branch if scope stays manage-web-only; otherwise split export first for an earlier reviewable slice.
