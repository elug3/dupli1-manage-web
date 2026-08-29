# Plan: Product import / export with images (manage-web)

**Status:** Phase 1 implemented (client ZIP in manage-web)  
**Repos:** `dupli1-manage-web` (primary); `dupli1` only if Phase 2 bulk APIs are approved  
**Related:** backend [product-sku-system.md](../../dupli1/docs/product-sku-system.md), [product-images-browser-access.md](../../dupli1/docs/product-images-browser-access.md), [product-price-on-parent.md](../../dupli1/docs/product-price-on-parent.md); gallery ops scripts `dupli1/scripts/import_gallery_products.py`, `upload_product_images.py`

**As-built (manage-web):**
- `app/lib/product-transfer.ts` — ZIP build/parse, master-gap preview, create-only import
- `app/components/ProductTransferActions.tsx` — Products toolbar Export / Import
- `listAllProductsPaged` + Blob-aware `uploadVariantImage` in `app/lib/api.ts`

---

## Goal

Let catalog managers **export** parent products + variants **including image files**, and **import** the same package (or an edited package) back into Dupli1 from the admin Products page — without hand-creating each SKU in the UI.

---

## Current state (as-built)

| Capability | Today |
|------------|--------|
| Create parent / variants / upload images | UI + API (`POST /products`, `POST …/variants`, `POST …/images`) |
| Bulk import/export in manage-web | **None** |
| Orders “Export CSV” i18n | String exists; products have no equivalent |
| Backend bulk endpoints | **None** — list is paginated (`limit` default 50, max 100) |
| Images | Multipart upload to MinIO/S3; `imageUrls` are absolute (local gateway or CloudFront) |
| Parent create requirements | Existing `brandCode` + `styleCode` masters |
| Variant create requirements | Existing `colorCode` + `sizeCode` (+ optional `editionCode`) |
| Price | Parent only (KRW whole won) |
| Permissions | `product.read`, `product.create`, `product.update`, `product.image.upload`, `product.master.read` |

`listAllProducts()` in `app/lib/api.ts` does **not** page through `total` — export must add a paginated fetcher first.

---

## Recommended approach (Phase 1)

**Client-orchestrated ZIP** in manage-web, reusing existing product APIs. No new backend routes for v1.

```text
Export:  search/pages → GET PDP per parent → download image bytes → build ZIP
Import:  parse ZIP → ensure/report masters → POST parent → POST variants → POST images
```

### Why not backend bulk first?

- Upload, masters, and auth already work end-to-end through the BFF session gateway.
- Ops scripts already prove the same API sequence (create → upload images).
- A server ZIP endpoint would need temp storage, long timeouts, and new permissions — defer until catalog size or timeouts force it.

### Package format: ZIP (not CSV alone)

CSV cannot carry binary images. Use:

```text
dupli1-products-export.zip
├── manifest.json          # schemaVersion + products[]
└── images/
    └── {productId}/
        └── {sku}/
            ├── 0.jpg
            └── 1.jpg
```

`manifest.json` is the source of truth for fields; image paths are relative to the ZIP root.

**Optional later:** also emit/accept a flat `products.csv` for spreadsheet edits of non-image fields — not required for Phase 1.

---

## Manifest schema (draft)

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-08-29T00:00:00Z",
  "source": "dupli1-manage-web",
  "products": [
    {
      "name": "Cassette Bag",
      "brandCode": "BOT",
      "styleCode": "CAS001",
      "material": "Leather",
      "category": "bags",
      "description": "…",
      "status": "active",
      "price": 3500000,
      "officialPrice": 4200000,
      "subCategory": "handbags",
      "style": "casual",
      "target": "women",
      "attributes": { "lining": "suede" },
      "variants": [
        {
          "colorCode": "BLK",
          "sizeCode": "MED",
          "editionCode": "V",
          "status": "active",
          "dimensions": { "widthMm": 230, "heightMm": 150, "depthMm": 50 },
          "images": ["images/…/0.jpg", "images/…/1.jpg"]
        }
      ]
    }
  ]
}
```

### Identity rules

| Field | Export | Import |
|-------|--------|--------|
| Parent `id` | Include as `exportedId` (informational) | **Do not** reuse — API assigns ULID |
| Variant `sku` / `skuId` | Include as `exportedSku` / `exportedSkuId` | **Do not** send — API composes SKU from codes |
| Master codes | Required | Must already exist (or Phase 1.1 auto-create — see Open questions) |
| Remote `imageUrls` | Not sufficient alone | Always re-upload file bytes via multipart |

Match on import: treat as **create-only** in Phase 1 (skip or fail if same `brandCode`+`styleCode`+variant codes already exist). Upsert is Phase 2.

---

## UX (manage-web)

Entry point: **Products** list header (`app/routes/products.tsx`), beside **New product**.

| Control | Behavior |
|---------|----------|
| **Export** | Respect current list filters (`q`, `brand`, `status`, `category`, …). Confirm “export N products”. Progress bar while paging + downloading images. Download ZIP. |
| **Import** | File picker (`.zip`). Validate `manifest.json`. Preview table: parents, variant count, image count, master-code gaps. **Dry-run** then **Import**. Row-level success / skip / error log downloadable as JSON. |

Permissions: hide/disable Export without `product.read` (+ image fetch); Import without `product.create` + `product.image.upload`. Master gaps need `product.master.read` (and optionally link to `/catalog`).

i18n: add `products.exportZip`, `products.importZip`, progress/error strings in `en` / `ko` / `zh-CN` (mirror unused `orders.exportCsv` pattern).

Preserve existing admin chrome (no new marketing layout). Keep actions as toolbar buttons, not a card-heavy wizard; one preview panel is enough for the import interaction.

---

## Implementation slices

### Phase 1 — manage-web only (ship this first)

1. **`app/lib/product-transfer.ts`** (new)
   - Types for `schemaVersion: 1` manifest
   - `fetchAllProductsForExport(query)` — paginate `searchProducts` until `offset + len >= total`
   - `buildExportZip(products)` — for each parent `getProductDetail`; for each variant image URL, `fetch(productImageSrc(url))` (same-origin rewrite so SSR/Vite proxy works); pack with a ZIP library (prefer `fflate` — small, no Node zlib dependency in browser)
   - `parseImportZip(file)` → `{ manifest, files: Map<path, Blob> }`
   - `runImport(manifest, files, { dryRun, onProgress })` — sequential API calls via existing `createProductParent` / `createVariant` / `uploadVariantImage`

2. **API helpers** (`app/lib/api.ts`)
   - Fix/add `listAllProductsPaged` that walks offsets (limit 100)
   - Optionally wrap `uploadVariantImage` for Blob + filename from ZIP entries

3. **UI**
   - Export / Import on `products.tsx`
   - Lightweight modal or route section for import preview + progress (`useNotify` for completion)

4. **BFF / proxy**
   - Confirm image `fetch` through `/product-images/…` works from the browser session (already used by `<img productImageSrc>`). Export download may need `credentials: "include"` only if images ever require auth — today public CDN/gateway paths do not; local MinIO via gateway should still work same-origin.
   - Multipart import already goes through `authedFetch` → session gateway; no change expected unless body size limits appear (see Risks).

5. **Tests**
   - Unit: manifest parse/validate, relative path resolution, skip-existing matching
   - Manual: export 1–2 seeded products with images → wipe/create on another brand codes set → re-import → PDP shows images

### Phase 2 — only if needed

| Trigger | Work |
|---------|------|
| Catalog ≫ ~200 parents or export timeouts | Backend `GET /api/v1/products/export` streaming ZIP (product service reads S3 directly) |
| Frequent re-sync / staging → prod | Upsert by `brandCode`+`styleCode`+variant codes; optional stock sync |
| Spreadsheet workflows | CSV sidecar + images folder convention |
| Missing masters block imports | Import option “create missing masters” (`product.master.write`) |

---

## Risks & constraints

| Risk | Mitigation |
|------|------------|
| Browser memory for large ZIPs | Cap export (e.g. warn > 50 parents or > 100 MB); Phase 2 server export |
| CORS / absolute CloudFront URLs on export | Prefer rewriting via `productImageSrc` when URL is gateway-shaped; for production CloudFront, browser `fetch` of public CDN should work; if not, add manage-web image proxy pass-through for export only |
| Master codes missing on import | Preview fails closed with link to `/catalog` |
| Duplicate parents | Create-only + explicit skip when codes collide |
| Empty `imageUrls` clear semantics | Import only appends via upload API; never PUT empty galleries |
| Gateway / SSR body size | Watch nginx + Node limits on multipart; upload images one file at a time (already the API) |
| Flatten model later ([product-flat-sellable-model-plan.md](../../dupli1/docs/product-flat-sellable-model-plan.md)) | Keep `schemaVersion`; bump if parent/variant shape changes |

---

## Out of scope (Phase 1)

- Inventory quantities / reservations
- Coupons, wishlist, view/sold counters
- Storefront (`dupli1-web`)
- Replacing Python gallery scripts (they remain for scraper pipelines)
- Backend OpenAPI changes

---

## Open questions (decide before coding)

1. **Missing masters:** fail import vs auto-create codes when user has `product.master.write`?
2. **Filter scope on export:** always current filters, or “export all” toggle?
3. **Stock:** include optional `quantity` in manifest and call inventory adjust after variant create?
4. **Library:** confirm `fflate` (or existing dep) for browser ZIP — avoid pulling JSZip if tree-shaking/`fflate` is enough.

**Proposed defaults:** fail on missing masters; export uses current filters + “export all matching”; no stock in Phase 1; use `fflate`.

---

## Success criteria

- Manager can download a ZIP of filtered products with real image files.
- Same ZIP (or edited manifest + images) imports as new parents/variants with images visible on PDP/SKU pages.
- Clear preview of master-code errors before any write.
- No backend deploy required for Phase 1.
