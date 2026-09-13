/**
 * Client-side product ZIP import/export (Phase 1).
 * See docs/product-import-export-plan.md.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  type Product,
  type ProductListQuery,
  type SkuDimensions,
  createProductParent,
  createVariant,
  dimensionsEmpty,
  getProductDetail,
  listAllProductsPaged,
  listBrands,
  listColors,
  listEditions,
  listSizes,
  listStyles,
  productImageSrc,
  productVariants,
  updateProduct,
  uploadVariantImage,
} from "./api";

export const MANIFEST_SCHEMA_VERSION = 1 as const;
export const EXPORT_WARN_PRODUCT_COUNT = 50;

export interface TransferManifestVariant {
  colorCode: string;
  sizeCode: string;
  editionCode?: string;
  status?: string;
  dimensions?: SkuDimensions;
  /** Relative paths inside the ZIP (e.g. images/{id}/{sku}/0.jpg). */
  images: string[];
  exportedSku?: string;
  exportedSkuId?: string;
}

export interface TransferManifestProduct {
  name: string;
  brandCode: string;
  styleCode: string;
  material: string;
  category?: string;
  description?: string;
  status?: string;
  price?: number;
  officialPrice?: number;
  subCategory?: string;
  style?: string;
  target?: string;
  attributes?: Record<string, string>;
  brand?: string;
  variants: TransferManifestVariant[];
  exportedId?: string;
}

export interface TransferManifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  exportedAt: string;
  source: string;
  products: TransferManifestProduct[];
}

export type TransferProgressPhase =
  | "listing"
  | "loading"
  | "images"
  | "packing"
  | "parsing"
  | "validating"
  | "importing"
  | "done";

export interface TransferProgress {
  phase: TransferProgressPhase;
  current: number;
  total: number;
  label?: string;
}

export interface MasterGap {
  kind: "brand" | "style" | "color" | "size" | "edition";
  code: string;
  brandCode?: string;
  productName?: string;
}

export interface ImportPreviewRow {
  index: number;
  name: string;
  brandCode: string;
  styleCode: string;
  variantCount: number;
  imageCount: number;
  status: "ok" | "skip" | "error";
  message?: string;
}

export interface ImportPreview {
  manifest: TransferManifest;
  files: Map<string, Uint8Array>;
  rows: ImportPreviewRow[];
  gaps: MasterGap[];
  canImport: boolean;
}

export interface ImportResultRow {
  index: number;
  name: string;
  status: "created" | "skipped" | "failed";
  productId?: string;
  message?: string;
}

export interface ImportResult {
  rows: ImportResultRow[];
  created: number;
  skipped: number;
  failed: number;
}

function normalizeCode(code: string | undefined | null): string {
  return (code ?? "").trim().toUpperCase();
}

function parentKey(brandCode: string, styleCode: string): string {
  return `${normalizeCode(brandCode)}|${normalizeCode(styleCode)}`;
}

function safePathSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return cleaned || "x";
}

function extFromUrlOrType(url: string, contentType: string | null): string {
  const path = url.split("?")[0] ?? url;
  const m = path.match(/\.(jpe?g|png|gif|webp|avif)$/i);
  if (m) return `.${m[1]!.toLowerCase().replace("jpeg", "jpg")}`;
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("gif")) return ".gif";
  if (contentType?.includes("avif")) return ".avif";
  return ".jpg";
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || "image.jpg";
}

/** Paginate search for export filters. */
export async function fetchAllProductsForExport(
  query: ProductListQuery = {},
  onProgress?: (p: TransferProgress) => void
): Promise<Product[]> {
  return listAllProductsPaged(query, (loaded, total) => {
    onProgress?.({
      phase: "listing",
      current: loaded,
      total,
      label: `${loaded}/${total}`,
    });
  });
}

async function downloadImageBytes(
  url: string
): Promise<{ bytes: Uint8Array; ext: string }> {
  const src = productImageSrc(url);
  const res = await fetch(src, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to download image (${res.status}): ${url}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  return { bytes: buf, ext: extFromUrlOrType(url, res.headers.get("content-type")) };
}

function productToManifestEntry(
  product: Product,
  imagePathsByVariant: Map<string, string[]>
): TransferManifestProduct {
  const variants = productVariants(product).map((v) => {
    const key = v.sku || v.skuId || "";
    return {
      colorCode: normalizeCode(v.colorCode) || normalizeCode(v.color),
      sizeCode: normalizeCode(v.sizeCode) || "OS",
      editionCode: v.editionCode ? normalizeCode(v.editionCode) : undefined,
      status: v.status || "active",
      dimensions: v.dimensions,
      images: imagePathsByVariant.get(key) ?? [],
      exportedSku: v.sku,
      exportedSkuId: v.skuId,
    } satisfies TransferManifestVariant;
  });

  return {
    name: product.name,
    brandCode: normalizeCode(product.brandCode),
    styleCode: normalizeCode(product.styleCode),
    material: product.material ?? "",
    category: product.category || "bags",
    description: product.description,
    status: product.status || "active",
    price: product.price,
    officialPrice: product.officialPrice,
    subCategory: product.subCategory,
    style: product.style,
    target: product.target,
    attributes: product.attributes,
    brand: product.brand,
    variants,
    exportedId: product.id,
  };
}

/**
 * Build a ZIP blob for the given list products (details + images fetched live).
 */
export async function buildExportZip(
  listProducts: Product[],
  onProgress?: (p: TransferProgress) => void
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const manifestProducts: TransferManifestProduct[] = [];
  const total = listProducts.length;

  for (let i = 0; i < listProducts.length; i++) {
    const listed = listProducts[i]!;
    onProgress?.({
      phase: "loading",
      current: i + 1,
      total,
      label: listed.name,
    });

    const product = await getProductDetail(listed.id);
    const imagePathsByVariant = new Map<string, string[]>();
    const variants = productVariants(product);
    const idSeg = safePathSegment(product.id);

    for (const variant of variants) {
      const skuSeg = safePathSegment(variant.sku || variant.skuId || "sku");
      const key = variant.sku || variant.skuId || "";
      const paths: string[] = [];
      const urls = variant.imageUrls ?? [];
      for (let imgIdx = 0; imgIdx < urls.length; imgIdx++) {
        const url = urls[imgIdx]!;
        onProgress?.({
          phase: "images",
          current: i + 1,
          total,
          label: `${product.name} / ${variant.sku} (${imgIdx + 1}/${urls.length})`,
        });
        try {
          const { bytes, ext } = await downloadImageBytes(url);
          const rel = `images/${idSeg}/${skuSeg}/${imgIdx}${ext}`;
          files[rel] = bytes;
          paths.push(rel);
        } catch {
          // Skip failed image downloads; still export catalog fields.
        }
      }
      imagePathsByVariant.set(key, paths);
    }

    manifestProducts.push(productToManifestEntry(product, imagePathsByVariant));
  }

  const manifest: TransferManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    source: "dupli1-manage-web",
    products: manifestProducts,
  };

  onProgress?.({ phase: "packing", current: total, total });
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));

  const zipped = zipSync(files, { level: 6 });
  onProgress?.({ phase: "done", current: total, total });
  return new Blob([zipped], { type: "application/zip" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function parseDimensions(raw: unknown): SkuDimensions | undefined {
  if (!isRecord(raw)) return undefined;
  const d: SkuDimensions = {};
  for (const key of ["widthMm", "heightMm", "depthMm"] as const) {
    const n = raw[key];
    if (typeof n === "number" && Number.isFinite(n)) d[key] = n;
  }
  return dimensionsEmpty(d) ? undefined : d;
}

function parseManifestProduct(
  raw: unknown,
  index: number
): TransferManifestProduct {
  if (!isRecord(raw)) {
    throw new Error(`products[${index}] must be an object`);
  }
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const brandCode = normalizeCode(
    typeof raw.brandCode === "string" ? raw.brandCode : ""
  );
  const styleCode = normalizeCode(
    typeof raw.styleCode === "string" ? raw.styleCode : ""
  );
  const material = typeof raw.material === "string" ? raw.material : "";
  if (!name) throw new Error(`products[${index}].name is required`);
  if (!brandCode) throw new Error(`products[${index}].brandCode is required`);
  if (!styleCode) throw new Error(`products[${index}].styleCode is required`);

  const variantsRaw = Array.isArray(raw.variants) ? raw.variants : [];
  if (variantsRaw.length === 0) {
    throw new Error(`products[${index}].variants must be non-empty`);
  }

  const variants: TransferManifestVariant[] = variantsRaw.map((v, vi) => {
    if (!isRecord(v)) {
      throw new Error(`products[${index}].variants[${vi}] must be an object`);
    }
    const colorCode = normalizeCode(
      typeof v.colorCode === "string" ? v.colorCode : ""
    );
    const sizeCode = normalizeCode(
      typeof v.sizeCode === "string" ? v.sizeCode : ""
    );
    if (!colorCode) {
      throw new Error(
        `products[${index}].variants[${vi}].colorCode is required`
      );
    }
    if (!sizeCode) {
      throw new Error(
        `products[${index}].variants[${vi}].sizeCode is required`
      );
    }
    const images = Array.isArray(v.images)
      ? v.images.filter((p): p is string => typeof p === "string" && p.length > 0)
      : [];
    const editionCode =
      typeof v.editionCode === "string" && v.editionCode.trim()
        ? normalizeCode(v.editionCode)
        : undefined;
    return {
      colorCode,
      sizeCode,
      editionCode,
      status: typeof v.status === "string" ? v.status : "active",
      dimensions: parseDimensions(v.dimensions),
      images,
      exportedSku: typeof v.exportedSku === "string" ? v.exportedSku : undefined,
      exportedSkuId:
        typeof v.exportedSkuId === "string" ? v.exportedSkuId : undefined,
    };
  });

  const attributes =
    isRecord(raw.attributes) &&
    Object.values(raw.attributes).every((x) => typeof x === "string")
      ? (raw.attributes as Record<string, string>)
      : undefined;

  return {
    name,
    brandCode,
    styleCode,
    material,
    category: typeof raw.category === "string" ? raw.category : "bags",
    description:
      typeof raw.description === "string" ? raw.description : undefined,
    status: typeof raw.status === "string" ? raw.status : "active",
    price: typeof raw.price === "number" ? raw.price : undefined,
    officialPrice:
      typeof raw.officialPrice === "number" ? raw.officialPrice : undefined,
    subCategory:
      typeof raw.subCategory === "string" ? raw.subCategory : undefined,
    style: typeof raw.style === "string" ? raw.style : undefined,
    target: typeof raw.target === "string" ? raw.target : undefined,
    attributes,
    brand: typeof raw.brand === "string" ? raw.brand : undefined,
    variants,
    exportedId: typeof raw.exportedId === "string" ? raw.exportedId : undefined,
  };
}

export function parseManifestJson(text: string): TransferManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("manifest.json is not valid JSON");
  }
  if (!isRecord(parsed)) throw new Error("manifest.json must be an object");
  if (parsed.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schemaVersion ${String(parsed.schemaVersion)} (want ${MANIFEST_SCHEMA_VERSION})`
    );
  }
  if (!Array.isArray(parsed.products)) {
    throw new Error("manifest.json products must be an array");
  }
  const products = parsed.products.map((p, i) => parseManifestProduct(p, i));
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    exportedAt:
      typeof parsed.exportedAt === "string"
        ? parsed.exportedAt
        : new Date().toISOString(),
    source:
      typeof parsed.source === "string" ? parsed.source : "dupli1-manage-web",
    products,
  };
}

export async function parseImportZip(file: File | Blob): Promise<{
  manifest: TransferManifest;
  files: Map<string, Uint8Array>;
}> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(buf);
  } catch {
    throw new Error("Invalid or corrupted ZIP file");
  }

  const files = new Map<string, Uint8Array>();
  let manifestBytes: Uint8Array | undefined;
  for (const [path, data] of Object.entries(unzipped)) {
    const norm = path.replace(/\\/g, "/").replace(/^\.\//, "");
    if (norm.endsWith("/")) continue;
    files.set(norm, data);
    if (norm === "manifest.json" || norm.endsWith("/manifest.json")) {
      manifestBytes = data;
    }
  }
  if (!manifestBytes) {
    throw new Error("ZIP is missing manifest.json");
  }
  const manifest = parseManifestJson(strFromU8(manifestBytes));
  return { manifest, files };
}

async function loadExistingParentKeys(): Promise<Set<string>> {
  const products = await listAllProductsPaged({});
  const keys = new Set<string>();
  for (const p of products) {
    if (p.brandCode && p.styleCode) {
      keys.add(parentKey(p.brandCode, p.styleCode));
    }
  }
  return keys;
}

async function collectMasterGaps(
  products: TransferManifestProduct[]
): Promise<MasterGap[]> {
  const gaps: MasterGap[] = [];
  const brands = await listBrands();
  const brandSet = new Set(brands.map((b) => normalizeCode(b.code)));
  const colors = await listColors();
  const colorSet = new Set(colors.map((c) => normalizeCode(c.code)));
  const sizes = await listSizes();
  const sizeSet = new Set(sizes.map((s) => normalizeCode(s.code)));
  let editionSet: Set<string> | null = null;
  try {
    const editions = await listEditions();
    editionSet = new Set(editions.map((e) => normalizeCode(e.code)));
  } catch {
    editionSet = null;
  }

  const styleCache = new Map<string, Set<string>>();

  async function stylesFor(brandCode: string): Promise<Set<string>> {
    const key = normalizeCode(brandCode);
    const cached = styleCache.get(key);
    if (cached) return cached;
    if (!brandSet.has(key)) {
      const empty = new Set<string>();
      styleCache.set(key, empty);
      return empty;
    }
    try {
      const rows = await listStyles(key);
      const set = new Set(rows.map((r) => normalizeCode(r.code)));
      styleCache.set(key, set);
      return set;
    } catch {
      const empty = new Set<string>();
      styleCache.set(key, empty);
      return empty;
    }
  }

  const seenBrand = new Set<string>();
  const seenStyle = new Set<string>();
  const seenColor = new Set<string>();
  const seenSize = new Set<string>();
  const seenEdition = new Set<string>();

  for (const p of products) {
    const bc = normalizeCode(p.brandCode);
    const sc = normalizeCode(p.styleCode);
    if (!brandSet.has(bc) && !seenBrand.has(bc)) {
      seenBrand.add(bc);
      gaps.push({ kind: "brand", code: bc, productName: p.name });
    }
    const styleKey = `${bc}|${sc}`;
    const styles = await stylesFor(bc);
    if (!styles.has(sc) && !seenStyle.has(styleKey)) {
      seenStyle.add(styleKey);
      gaps.push({
        kind: "style",
        code: sc,
        brandCode: bc,
        productName: p.name,
      });
    }
    for (const v of p.variants) {
      const cc = normalizeCode(v.colorCode);
      const sz = normalizeCode(v.sizeCode);
      if (!colorSet.has(cc) && !seenColor.has(cc)) {
        seenColor.add(cc);
        gaps.push({ kind: "color", code: cc, productName: p.name });
      }
      if (!sizeSet.has(sz) && !seenSize.has(sz)) {
        seenSize.add(sz);
        gaps.push({ kind: "size", code: sz, productName: p.name });
      }
      if (v.editionCode && editionSet) {
        const ec = normalizeCode(v.editionCode);
        if (!editionSet.has(ec) && !seenEdition.has(ec)) {
          seenEdition.add(ec);
          gaps.push({ kind: "edition", code: ec, productName: p.name });
        }
      }
    }
  }

  return gaps;
}

function missingImagesForProduct(
  product: TransferManifestProduct,
  files: Map<string, Uint8Array>
): string[] {
  const missing: string[] = [];
  for (const v of product.variants) {
    for (const path of v.images) {
      const norm = path.replace(/\\/g, "/").replace(/^\.\//, "");
      if (!files.has(norm)) missing.push(norm);
    }
  }
  return missing;
}

export async function buildImportPreview(
  manifest: TransferManifest,
  files: Map<string, Uint8Array>,
  onProgress?: (p: TransferProgress) => void
): Promise<ImportPreview> {
  onProgress?.({
    phase: "validating",
    current: 0,
    total: manifest.products.length,
  });
  const [existing, gaps] = await Promise.all([
    loadExistingParentKeys(),
    collectMasterGaps(manifest.products),
  ]);

  const rows: ImportPreviewRow[] = manifest.products.map((p, index) => {
    const imageCount = p.variants.reduce((n, v) => n + v.images.length, 0);
    const key = parentKey(p.brandCode, p.styleCode);
    if (existing.has(key)) {
      return {
        index,
        name: p.name,
        brandCode: p.brandCode,
        styleCode: p.styleCode,
        variantCount: p.variants.length,
        imageCount,
        status: "skip" as const,
        message: `Already exists (${p.brandCode}_${p.styleCode})`,
      };
    }
    const productGaps = gaps.filter((g) => {
      if (g.kind === "brand" && g.code === p.brandCode) return true;
      if (
        g.kind === "style" &&
        g.code === p.styleCode &&
        g.brandCode === p.brandCode
      ) {
        return true;
      }
      if (g.kind === "color" || g.kind === "size" || g.kind === "edition") {
        return p.variants.some((v) => {
          if (g.kind === "color") return normalizeCode(v.colorCode) === g.code;
          if (g.kind === "size") return normalizeCode(v.sizeCode) === g.code;
          return (
            v.editionCode != null && normalizeCode(v.editionCode) === g.code
          );
        });
      }
      return false;
    });
    if (productGaps.length > 0) {
      return {
        index,
        name: p.name,
        brandCode: p.brandCode,
        styleCode: p.styleCode,
        variantCount: p.variants.length,
        imageCount,
        status: "error" as const,
        message: productGaps
          .map((g) =>
            g.kind === "style"
              ? `missing style ${g.brandCode}/${g.code}`
              : `missing ${g.kind} ${g.code}`
          )
          .join("; "),
      };
    }
    const missingImgs = missingImagesForProduct(p, files);
    return {
      index,
      name: p.name,
      brandCode: p.brandCode,
      styleCode: p.styleCode,
      variantCount: p.variants.length,
      imageCount,
      status: "ok" as const,
      message:
        missingImgs.length > 0
          ? `Missing ${missingImgs.length} image file(s) in ZIP (will skip those)`
          : undefined,
    };
  });

  const canImport = gaps.length === 0 && rows.some((r) => r.status === "ok");

  onProgress?.({
    phase: "done",
    current: manifest.products.length,
    total: manifest.products.length,
  });

  return { manifest, files, rows, gaps, canImport };
}

export async function runImport(
  preview: ImportPreview,
  options: {
    dryRun?: boolean;
    onProgress?: (p: TransferProgress) => void;
  } = {}
): Promise<ImportResult> {
  const { dryRun = false, onProgress } = options;
  const { manifest, files, rows } = preview;
  const resultRows: ImportResultRow[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const total = manifest.products.length;

  if (preview.gaps.length > 0 && !dryRun) {
    throw new Error(
      "Cannot import while catalog master codes are missing. Fix masters in Catalog first."
    );
  }

  for (let i = 0; i < manifest.products.length; i++) {
    const product = manifest.products[i]!;
    const previewRow = rows[i];
    onProgress?.({
      phase: "importing",
      current: i + 1,
      total,
      label: product.name,
    });

    if (previewRow?.status === "skip") {
      skipped += 1;
      resultRows.push({
        index: i,
        name: product.name,
        status: "skipped",
        message: previewRow.message,
      });
      continue;
    }
    if (previewRow?.status === "error") {
      failed += 1;
      resultRows.push({
        index: i,
        name: product.name,
        status: "failed",
        message: previewRow.message,
      });
      continue;
    }

    if (dryRun) {
      created += 1;
      resultRows.push({
        index: i,
        name: product.name,
        status: "created",
        message: "dry-run",
      });
      continue;
    }

    try {
      const parent = await createProductParent({
        name: product.name,
        brandCode: product.brandCode,
        styleCode: product.styleCode,
        material: product.material || "—",
        brand: product.brand,
        category: product.category ?? "bags",
        description: product.description,
        status: product.status ?? "active",
        price: product.price,
        officialPrice: product.officialPrice,
        attributes: product.attributes,
      });

      await updateProduct(parent.id, {
        name: product.name,
        description: product.description,
        price: product.price,
        officialPrice: product.officialPrice,
        material: product.material || "—",
        brand: product.brand,
        category: product.category ?? "bags",
        subCategory: product.subCategory ?? "",
        style: product.style ?? "",
        target: product.target ?? "",
        attributes: product.attributes ?? {},
        status: product.status ?? "active",
      });

      for (const v of product.variants) {
        const createdVariant = await createVariant(parent.id, {
          colorCode: v.colorCode,
          sizeCode: v.sizeCode,
          editionCode: v.editionCode,
          status: v.status ?? "active",
          dimensions: v.dimensions,
        });
        for (const rel of v.images) {
          const norm = rel.replace(/\\/g, "/").replace(/^\.\//, "");
          const bytes = files.get(norm);
          if (!bytes) continue;
          const copy = new Uint8Array(bytes.byteLength);
          copy.set(bytes);
          const blob = new Blob([copy], {
            type: guessMime(norm),
          });
          await uploadVariantImage(
            parent.id,
            createdVariant.sku,
            blob,
            basename(norm)
          );
        }
      }

      created += 1;
      resultRows.push({
        index: i,
        name: product.name,
        status: "created",
        productId: parent.id,
      });
    } catch (err) {
      failed += 1;
      resultRows.push({
        index: i,
        name: product.name,
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  onProgress?.({ phase: "done", current: total, total });
  return { rows: resultRows, created, skipped, failed };
}

function guessMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}

export function formatGapLabel(gap: MasterGap): string {
  if (gap.kind === "style") {
    return `style ${gap.brandCode}/${gap.code}`;
  }
  return `${gap.kind} ${gap.code}`;
}
