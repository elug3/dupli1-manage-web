import { authedFetch } from "./auth";
import { publishOrderUpdate } from "./order-updates";
import {
  authPath,
  inventoryPath,
  orderPath,
  productPath,
} from "./gateway";

// ── Product catalog ────────────────────────────────────────────────────────────

export type ProductSearchHit = Record<string, unknown>;

export interface ProductSearchResponse {
  total: number;
  results: ProductSearchHit[];
  limit?: number;
  offset?: number;
  sort?: string;
  order?: string;
  period?: string;
}

/** Query params for `GET /api/v1/products` (server-side filters). */
export interface ProductListQuery {
  q?: string;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  material?: string;
  status?: string;
  sort?: string;
  order?: string;
  period?: string;
  limit?: number;
  offset?: number;
}

export interface ProductListResult {
  products: Product[];
  total: number;
  limit: number;
  offset: number;
  sort?: string;
  order?: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  /**
   * Actual sale price (KRW won) on the parent product.
   * Variants echo this on read; create/update variant ignores price.
   */
  price?: number;
  /** Reference / list price on the parent (not charged). */
  officialPrice?: number;
  stock?: number;
  description?: string;
  brand?: string;
  /** Immutable master brand code (e.g. BOT). */
  brandCode?: string;
  /** Immutable master style code under brand (e.g. CAS001). */
  styleCode?: string;
  /** Bag type under category (handbags, tote, …). */
  subCategory?: string;
  /** Bag occasion / look (casual, evening, …) — not styleCode. */
  style?: string;
  /** Audience (men, women, kids). */
  target?: string;
  /**
   * Free-form parent memo (string key → string value).
   * Display-only; not used for search/pricing/checkout.
   */
  attributes?: Record<string, string>;
  color?: string;
  material?: string;
  sku?: string;
  status?: string;
  imageUrls?: string[];
  /** Parent catalog summaries (variant model). */
  availableColors?: string[];
  availableSizes?: string[];
  defaultImageUrl?: string;
  variants?: ProductVariant[];
  raw: ProductSearchHit;
}

/** Physical SKU size in millimeters (distinct from letter size / sizeCode). */
export interface SkuDimensions {
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
}

export const MAX_DIMENSION_MM = 10000;

export interface ProductVariant {
  /** Canonical ULID used by inventory / cart / order. */
  skuId?: string;
  /** Human-composed SKU (immutable after create). */
  sku: string;
  productId?: string;
  color: string;
  size: string;
  colorCode?: string;
  sizeCode?: string;
  editionCode?: string;
  /**
   * Echo of parent officialPrice (API still includes it for cart clients).
   * Not stored or writable on the variant.
   */
  officialPrice?: number;
  /** Echo of parent sale price (not stored on the variant). */
  price: number;
  status: string;
  imageUrls: string[];
  /** Physical measurements in mm; omit when unset. */
  dimensions?: SkuDimensions;
  inStock?: boolean;
  raw: ProductSearchHit;
}

/** Master-data dictionary entry (`/api/v1/products/catalog/...`). */
export interface CatalogCodeName {
  code: string;
  name: string;
}

export interface CatalogStyle extends CatalogCodeName {
  brandCode: string;
}

export interface VariantStockAlert {
  parentId: string;
  parentName: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  available: number;
}

function hitId(hit: ProductSearchHit, index: number): string {
  const id = hit.id ?? hit.sku ?? hit.title;
  return typeof id === "string" ? id : `item-${index}`;
}

function hitName(hit: ProductSearchHit): string {
  const name = hit.name ?? hit.title ?? hit.sku;
  return typeof name === "string" ? name : "Untitled";
}

function hitNumber(hit: ProductSearchHit, key: string): number | undefined {
  const value = hit[key];
  return typeof value === "number" ? value : undefined;
}

function hitString(hit: ProductSearchHit, key: string): string | undefined {
  const value = hit[key];
  return typeof value === "string" ? value : undefined;
}

function hitStringArray(hit: ProductSearchHit, key: string): string[] | undefined {
  const value = hit[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((v): v is string => typeof v === "string");
  return strings.length > 0 ? strings : undefined;
}

function hitStringMap(
  hit: ProductSearchHit,
  key: string
): Record<string, string> | undefined {
  const value = hit[key];
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k === "string" && typeof v === "string") {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Backend limits for product attributes (see dupli1 product-attributes.md). */
export const MAX_PRODUCT_ATTRIBUTES = 32;
export const MAX_ATTRIBUTE_KEY_LEN = 64;
export const MAX_ATTRIBUTE_VALUE_LEN = 512;

/** Normalize attribute rows into an API map (trim, drop empty keys). */
export function attributesFromRows(
  rows: { key: string; value: string }[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    out[key] = row.value.trim();
  }
  return out;
}

export function attributeRowsFromMap(
  attrs: Record<string, string> | undefined
): { key: string; value: string }[] {
  if (!attrs) return [];
  return Object.entries(attrs).map(([key, value]) => ({ key, value }));
}

function hitDimensionAxis(
  obj: Record<string, unknown>,
  camel: string,
  snake: string
): number | undefined {
  const value = obj[camel] ?? obj[snake];
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.trunc(value);
  return n > 0 ? n : undefined;
}

/** Parse variant `dimensions` from API JSON (camelCase or snake_case axes). */
export function mapDimensions(raw: unknown): SkuDimensions | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const widthMm = hitDimensionAxis(obj, "widthMm", "width_mm");
  const heightMm = hitDimensionAxis(obj, "heightMm", "height_mm");
  const depthMm = hitDimensionAxis(obj, "depthMm", "depth_mm");
  if (widthMm == null && heightMm == null && depthMm == null) return undefined;
  return { widthMm, heightMm, depthMm };
}

export function dimensionsEmpty(d?: SkuDimensions | null): boolean {
  return (
    d == null ||
    ((d.widthMm == null || d.widthMm === 0) &&
      (d.heightMm == null || d.heightMm === 0) &&
      (d.depthMm == null || d.depthMm === 0))
  );
}

/** Format for display, e.g. `340 × 220 × 80 mm`. */
export function formatDimensionsMm(d?: SkuDimensions | null): string | undefined {
  if (dimensionsEmpty(d) || !d) return undefined;
  const parts = [d.widthMm, d.heightMm, d.depthMm]
    .filter((n): n is number => typeof n === "number" && n > 0)
    .map(String);
  if (parts.length === 0) return undefined;
  return `${parts.join(" × ")} mm`;
}

/**
 * Build a create/update payload from form axis strings.
 * Returns `undefined` when every axis is blank (caller may omit or clear).
 */
export function parseDimensionsInput(input: {
  widthMm: string;
  heightMm: string;
  depthMm: string;
}): { dimensions?: SkuDimensions; error?: string } {
  const axes: { key: keyof SkuDimensions; raw: string }[] = [
    { key: "widthMm", raw: input.widthMm.trim() },
    { key: "heightMm", raw: input.heightMm.trim() },
    { key: "depthMm", raw: input.depthMm.trim() },
  ];
  const out: SkuDimensions = {};
  for (const { key, raw } of axes) {
    if (raw === "") continue;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || String(n) !== raw || n < 0) {
      return { error: "INVALID_DIMENSION" };
    }
    if (n > MAX_DIMENSION_MM) {
      return { error: "DIMENSION_TOO_LARGE" };
    }
    if (n > 0) out[key] = n;
  }
  if (dimensionsEmpty(out)) return {};
  return { dimensions: out };
}

function mapVariant(hit: ProductSearchHit): ProductVariant {
  const sku =
    hitString(hit, "sku") ?? hitString(hit, "id") ?? "unknown-sku";
  return {
    skuId: hitString(hit, "skuId") ?? hitString(hit, "sku_id"),
    sku,
    productId: hitString(hit, "product_id") ?? hitString(hit, "productId"),
    color: hitString(hit, "color") ?? "",
    size: hitString(hit, "size") ?? "",
    colorCode: hitString(hit, "colorCode") ?? hitString(hit, "color_code"),
    sizeCode: hitString(hit, "sizeCode") ?? hitString(hit, "size_code"),
    editionCode:
      hitString(hit, "editionCode") ?? hitString(hit, "edition_code"),
    officialPrice:
      hitNumber(hit, "officialPrice") ??
      hitNumber(hit, "official_price") ??
      hitNumber(hit, "sellingPrice") ??
      hitNumber(hit, "selling_price"),
    price: hitNumber(hit, "price") ?? 0,
    status: hitString(hit, "status") ?? "active",
    imageUrls: hitStringArray(hit, "imageUrls") ?? [],
    dimensions: mapDimensions(hit.dimensions),
    inStock:
      typeof hit.inStock === "boolean"
        ? hit.inStock
        : typeof hit.in_stock === "boolean"
          ? hit.in_stock
          : undefined,
    raw: hit,
  };
}

function mapVariantsFromHit(hit: ProductSearchHit): ProductVariant[] | undefined {
  const raw = hit.variants;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw
    .filter((v): v is ProductSearchHit => v != null && typeof v === "object")
    .map((v) => mapVariant(v as ProductSearchHit));
}

/** Legacy flat product → single sellable variant (backfill-compatible). */
export function legacyVariantFromProduct(product: Product): ProductVariant {
  return {
    sku: product.sku ?? product.id,
    productId: product.id,
    color: product.color ?? "",
    size: "",
    officialPrice: product.officialPrice,
    price: product.price ?? 0,
    status: product.status ?? "active",
    imageUrls: product.imageUrls ?? [],
    raw: product.raw,
  };
}

export function productVariants(product: Product): ProductVariant[] {
  if (product.variants && product.variants.length > 0) {
    return product.variants;
  }
  return [legacyVariantFromProduct(product)];
}

/** Resolve a variant by canonical skuId, falling back to human sku. */
export function findVariant(
  product: Product,
  skuIdOrSku: string
): ProductVariant | undefined {
  const variants = productVariants(product);
  return (
    variants.find((v) => v.skuId === skuIdOrSku) ??
    variants.find((v) => v.sku === skuIdOrSku)
  );
}

/** Admin SKU detail path: `/products/{productId}/SKU/{skuId}`. */
export function productSkuPath(productId: string, skuIdOrSku: string): string {
  return `/products/${encodeURIComponent(productId)}/SKU/${encodeURIComponent(skuIdOrSku)}`;
}

export function formatVariantOption(variant: ProductVariant): string {
  const parts = [variant.color, variant.size].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : variant.sku;
}

export function formatProductColors(product: Product): string {
  if (product.availableColors && product.availableColors.length > 0) {
    return product.availableColors.join(", ");
  }
  if (product.color) return product.color;
  return "—";
}

export function productVariantCount(product: Product): number {
  if (product.variants && product.variants.length > 0) {
    return product.variants.length;
  }
  return 1;
}

export function productListPrice(product: Product): string | null {
  if (product.price == null) return null;
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(product.price);
}

/**
 * Make gateway-hosted product image URLs loadable from the manage-web origin.
 *
 * Local Docker returns absolute URLs like `http://localhost:8080/product-images/…`
 * (nginx → MinIO). Browsers on the Vite/SSR origin cannot rely on that host when
 * it is unreachable (remote tunnel, different machine). Rewrite those to a
 * same-origin `/product-images/…` path; Vite and the SSR route proxy to the gateway.
 *
 * Private AWS S3 object URLs (bucket Block Public Access) cannot be fixed here —
 * they need CloudFront OAC or a gateway image proxy in `dupli1`. Keep the original
 * URL for API mutations (delete/update match exact strings).
 */
export function productImageSrc(url: string): string {
  if (!url || url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith("/product-images/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Relative or opaque strings — use as-is.
  }
  return url;
}

/** Best-effort thumbnail for list cards (parent default or first variant image). */
export function productPreviewImage(product: Product): string | null {
  let url: string | null = null;
  if (product.defaultImageUrl) url = product.defaultImageUrl;
  else if (product.imageUrls && product.imageUrls.length > 0) {
    url = product.imageUrls[0];
  } else {
    for (const variant of productVariants(product)) {
      if (variant.imageUrls.length > 0) {
        url = variant.imageUrls[0];
        break;
      }
    }
  }
  return url ? productImageSrc(url) : null;
}

export interface SkuVariantContext {
  productId: string;
  productName: string;
  color: string;
  size: string;
}

/** Map variant SKU → parent product and option labels (for order line items). */
export function buildVariantSkuIndex(
  products: Product[]
): Map<string, SkuVariantContext> {
  const index = new Map<string, SkuVariantContext>();
  for (const product of products) {
    for (const variant of productVariants(product)) {
      index.set(variant.sku, {
        productId: product.id,
        productName: product.name,
        color: variant.color,
        size: variant.size,
      });
    }
  }
  return index;
}

export function formatOrderItemVariant(
  sku: string,
  lookup: Map<string, SkuVariantContext>
): string | null {
  const ctx = lookup.get(sku);
  if (!ctx) return null;
  const option = [ctx.color, ctx.size].filter(Boolean).join(" / ");
  return option || null;
}

export function mapProduct(
  hit: ProductSearchHit,
  category?: string,
  index = 0
): Product {
  const variants = mapVariantsFromHit(hit);
  const defaultImageUrl =
    hitString(hit, "defaultImageUrl") ??
    hitString(hit, "default_image_url") ??
    variants?.[0]?.imageUrls[0];

  return {
    id: hitId(hit, index),
    name: hitName(hit),
    category: category ?? hitString(hit, "category") ?? "bags",
    price:
      hitNumber(hit, "price") ??
      hitNumber(hit, "priceFrom") ??
      hitNumber(hit, "price_from") ??
      hitNumber(hit, "unit_price_won"),
    officialPrice:
      hitNumber(hit, "officialPrice") ??
      hitNumber(hit, "official_price") ??
      hitNumber(hit, "sellingPrice") ??
      hitNumber(hit, "selling_price") ??
      hitNumber(hit, "sellingPriceFrom") ??
      hitNumber(hit, "selling_price_from"),
    stock: hitNumber(hit, "stock") ?? hitNumber(hit, "quantity"),
    description: hitString(hit, "description"),
    brand: hitString(hit, "brand"),
    brandCode: hitString(hit, "brandCode") ?? hitString(hit, "brand_code"),
    styleCode: hitString(hit, "styleCode") ?? hitString(hit, "style_code"),
    subCategory:
      hitString(hit, "subCategory") ?? hitString(hit, "sub_category"),
    style: hitString(hit, "style") ?? hitString(hit, "bag_style"),
    target: hitString(hit, "target"),
    attributes: hitStringMap(hit, "attributes"),
    color: hitString(hit, "color"),
    material: hitString(hit, "material"),
    sku: hitString(hit, "sku") ?? hitString(hit, "id"),
    status: hitString(hit, "status"),
    imageUrls:
      hitStringArray(hit, "imageUrls") ??
      (defaultImageUrl ? [defaultImageUrl] : undefined),
    availableColors:
      hitStringArray(hit, "availableColors") ??
      hitStringArray(hit, "available_colors"),
    availableSizes:
      hitStringArray(hit, "availableSizes") ??
      hitStringArray(hit, "available_sizes"),
    defaultImageUrl,
    variants,
    raw: hit,
  };
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/** List products with optional server-side filters / sort / pagination. */
export async function searchProducts(
  query: ProductListQuery = {}
): Promise<ProductListResult> {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined) => {
    if (value == null) return;
    const text = String(value).trim();
    if (text) params.set(key, text);
  };
  set("q", query.q);
  set("category", query.category);
  set("brand", query.brand);
  set("color", query.color);
  set("size", query.size);
  set("material", query.material);
  set("status", query.status);
  set("sort", query.sort);
  set("order", query.order);
  set("period", query.period);
  set("limit", query.limit);
  set("offset", query.offset);

  const qs = params.toString();
  const res = await authedFetch(
    productPath(`/api/v1/products${qs ? `?${qs}` : ""}`)
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to list products"));
  const data = (await res.json()) as ProductSearchResponse;
  const hits = Array.isArray(data.results) ? data.results : [];
  return {
    products: hits.map((hit, i) => mapProduct(hit, undefined, i)),
    total: typeof data.total === "number" ? data.total : hits.length,
    limit: typeof data.limit === "number" ? data.limit : query.limit ?? 50,
    offset: typeof data.offset === "number" ? data.offset : query.offset ?? 0,
    sort: data.sort,
    order: data.order,
  };
}

/** List products (all statuses when authenticated with product.read). */
export async function listAllProducts(
  query: ProductListQuery = {}
): Promise<Product[]> {
  const { products } = await searchProducts(query);
  return products;
}

const EXPORT_PAGE_SIZE = 100;

/**
 * Walk every page of `GET /api/v1/products` for the given filters.
 * Prefer this over `listAllProducts` when the catalog may exceed one page.
 */
export async function listAllProductsPaged(
  query: ProductListQuery = {},
  onPage?: (loaded: number, total: number) => void
): Promise<Product[]> {
  const pageSize = Math.min(query.limit ?? EXPORT_PAGE_SIZE, EXPORT_PAGE_SIZE);
  const all: Product[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const page = await searchProducts({
      ...query,
      limit: pageSize,
      offset,
    });
    total = page.total;
    all.push(...page.products);
    onPage?.(all.length, total);
    if (page.products.length === 0) break;
    offset += page.products.length;
    if (page.products.length < pageSize) break;
  }

  return all;
}

export async function getProducts(): Promise<Product[]> {
  return listAllProducts();
}

/** Parent + embedded variants; falls back to the all-status list for drafts/archived. */
export async function getManageProduct(id: string): Promise<Product> {
  try {
    return await getProductDetail(id);
  } catch {
    const all = await listAllProducts();
    const found = all.find((p) => p.id === id || p.sku === id);
    if (!found) throw new Error("Product not found");
    return found;
  }
}

/** Parent + embedded variants (admin/public PDP shape). */
export async function getProductDetail(id: string): Promise<Product> {
  const res = await authedFetch(
    productPath(`/api/v1/products/${encodeURIComponent(id)}`)
  );
  if (!res.ok) throw new Error(await readError(res, "Product not found"));
  const hit = (await res.json()) as ProductSearchHit;
  return mapProduct(hit);
}

export async function uploadProductImage(
  id: string,
  file: File
): Promise<Product> {
  const form = new FormData();
  form.append("image", file);
  const res = await authedFetch(
    productPath(`/api/v1/products/${encodeURIComponent(id)}/images`),
    { method: "POST", body: form }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to upload image"));
  const hit = (await res.json()) as ProductSearchHit;
  return mapProduct(hit);
}

export async function uploadVariantImage(
  productId: string,
  sku: string,
  file: File | Blob,
  filename = "image.jpg"
): Promise<ProductVariant> {
  const form = new FormData();
  if (file instanceof File) {
    form.append("image", file);
  } else {
    form.append("image", file, filename);
  }
  const res = await authedFetch(
    productPath(
      `/api/v1/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(sku)}/images`
    ),
    { method: "POST", body: form }
  );
  if (!res.ok) {
    throw new Error(await readError(res, "Failed to upload variant image"));
  }
  const hit = (await res.json()) as ProductSearchHit;
  return mapVariant(hit);
}

export interface CreateBagProductInput {
  name: string;
  id: string;
  brand: string;
  color: string;
  material: string;
}

export interface CreateProductParentInput {
  name: string;
  /** Existing master brand code (required). */
  brandCode: string;
  /** Existing master style code under brand (required). */
  styleCode: string;
  material: string;
  /** Optional display brand name; backend enriches from master when blank. */
  brand?: string;
  category?: string;
  description?: string;
  status?: string;
  /** Actual sale price (KRW won) on the parent. */
  price?: number;
  /** Reference / list price on the parent (not charged). */
  officialPrice?: number;
  /** Free-form parent memo; omit to leave unset on create. */
  attributes?: Record<string, string>;
}

export async function createProductParent(
  input: CreateProductParentInput
): Promise<Product> {
  const res = await authedFetch(productPath("/api/v1/products"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      brandCode: input.brandCode,
      styleCode: input.styleCode,
      brand: input.brand,
      material: input.material,
      category: input.category ?? "bags",
      description: input.description,
      status: input.status ?? "active",
      price: input.price,
      officialPrice: input.officialPrice,
      attributes: input.attributes,
    }),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create product"));
  const hit = (await res.json()) as ProductSearchHit;
  return mapProduct(hit, input.category ?? "bags");
}

export interface CreateVariantInput {
  colorCode: string;
  sizeCode: string;
  editionCode?: string;
  /** Optional display names; backend enriches from masters when blank. */
  color?: string;
  size?: string;
  status?: string;
  /** Optional physical size in mm. */
  dimensions?: SkuDimensions;
}

export async function createVariant(
  productId: string,
  input: CreateVariantInput
): Promise<ProductVariant> {
  const body: Record<string, unknown> = {
    colorCode: input.colorCode,
    sizeCode: input.sizeCode,
    editionCode: input.editionCode || undefined,
    color: input.color,
    size: input.size,
    status: input.status ?? "active",
  };
  if (input.dimensions && !dimensionsEmpty(input.dimensions)) {
    body.dimensions = input.dimensions;
  }
  const res = await authedFetch(
    productPath(
      `/api/v1/products/${encodeURIComponent(productId)}/variants`
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to create variant"));
  const hit = (await res.json()) as ProductSearchHit;
  return mapVariant(hit);
}

export interface UpdateVariantInput {
  color?: string;
  size?: string;
  status?: string;
  /** Replaces the variant gallery when non-empty. Empty arrays are ignored by the API merge. */
  imageUrls?: string[];
  /**
   * Merge-on-update: omit to keep; `{}` clears; non-empty object replaces all axes.
   * Pass `null` to omit from the JSON body.
   */
  dimensions?: SkuDimensions | Record<string, never> | null;
}

export async function updateVariant(
  productId: string,
  sku: string,
  input: UpdateVariantInput
): Promise<ProductVariant> {
  const body: Record<string, unknown> = {};
  if (input.color !== undefined) body.color = input.color;
  if (input.size !== undefined) body.size = input.size;
  if (input.status !== undefined) body.status = input.status;
  if (input.imageUrls !== undefined) body.imageUrls = input.imageUrls;
  if (input.dimensions !== undefined && input.dimensions !== null) {
    body.dimensions = input.dimensions;
  }
  const res = await authedFetch(
    productPath(
      `/api/v1/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(sku)}`
    ),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update variant"));
  const hit = (await res.json()) as ProductSearchHit;
  return mapVariant(hit);
}

/**
 * Removes one image URL from a variant gallery.
 * When other images remain, PUTs the filtered list. Clearing the final image is
 * unsupported by the API merge (empty imageUrls is treated as "omit").
 * Callers should surface `LAST_IMAGE` via i18n (`productDetail.cannotDeleteLastImage`).
 */
export class LastImageDeleteError extends Error {
  readonly code = "LAST_IMAGE" as const;
  constructor() {
    super("LAST_IMAGE");
    this.name = "LastImageDeleteError";
  }
}

export async function deleteVariantImage(
  productId: string,
  sku: string,
  imageUrl: string,
  currentUrls: string[]
): Promise<ProductVariant> {
  const next = currentUrls.filter((url) => url !== imageUrl);
  if (next.length === currentUrls.length) {
    throw new Error("Image not found on variant");
  }
  if (next.length === 0) {
    throw new LastImageDeleteError();
  }
  return updateVariant(productId, sku, { imageUrls: next });
}

export async function deleteVariant(
  productId: string,
  sku: string
): Promise<void> {
  const res = await authedFetch(
    productPath(
      `/api/v1/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(sku)}`
    ),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete variant"));
}

/** Legacy flat create (single SKU); prefer createProductParent + createVariant. */
export async function createBagProduct(
  input: CreateBagProductInput
): Promise<Product> {
  const res = await authedFetch(productPath("/api/v1/products"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      id: input.id,
      brand: input.brand,
      color: input.color,
      material: input.material,
      category: "bags",
    }),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create product"));
  const hit = (await res.json()) as ProductSearchHit;
  return mapProduct(hit, "bags");
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  /** Actual sale price (KRW won). Omitted keeps current (backend merge). */
  price?: number;
  /** Reference / list price. Omitted keeps current (backend merge). */
  officialPrice?: number;
  cost?: number;
  brand?: string;
  color?: string;
  material?: string;
  stock?: number;
  category?: string;
  /** Bag type code; blank clears. Always send with updates to avoid wipe. */
  subCategory?: string;
  /** Bag occasion code; blank clears. Always send with updates to avoid wipe. */
  style?: string;
  /** Audience code; blank clears. Always send with updates to avoid wipe. */
  target?: string;
  /**
   * Full attributes map replace. Omit to keep existing; `{}` clears.
   * Partial key patches are not supported by the API.
   */
  attributes?: Record<string, string>;
  status?: string;
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput
): Promise<Product> {
  const res = await authedFetch(
    productPath(`/api/v1/products/${encodeURIComponent(id)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update product"));
  const hit = (await res.json()) as ProductSearchHit;
  return mapProduct(hit);
}

export async function deleteProduct(id: string): Promise<void> {
  const res = await authedFetch(
    productPath(`/api/v1/products/${encodeURIComponent(id)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete product"));
}

// ── Catalog master data (SKU dictionaries) ─────────────────────────────────────

async function parseCatalogList<T>(res: Response, fallback: string): Promise<T[]> {
  if (!res.ok) throw new Error(await readError(res, fallback));
  const data = (await res.json()) as T[] | { results?: T[] };
  if (Array.isArray(data)) return data;
  return Array.isArray(data.results) ? data.results : [];
}

/** Bag merchandising taxonomy (storefront filters; not SKU segment masters). */
export interface MasterCatalog {
  subCategories: CatalogCodeName[];
  styles: CatalogCodeName[];
  targets: CatalogCodeName[];
}

export async function getMasterCatalog(): Promise<MasterCatalog> {
  const res = await authedFetch(productPath("/api/v1/products/catalog/master"));
  if (!res.ok) {
    throw new Error(await readError(res, "Failed to load master catalog"));
  }
  const data = (await res.json()) as Partial<MasterCatalog>;
  return {
    subCategories: Array.isArray(data.subCategories) ? data.subCategories : [],
    styles: Array.isArray(data.styles) ? data.styles : [],
    targets: Array.isArray(data.targets) ? data.targets : [],
  };
}

export async function listBrands(): Promise<CatalogCodeName[]> {
  const res = await authedFetch(productPath("/api/v1/products/catalog/brands"));
  return parseCatalogList<CatalogCodeName>(res, "Failed to list brands");
}

export async function createBrand(
  code: string,
  name: string
): Promise<CatalogCodeName> {
  const res = await authedFetch(productPath("/api/v1/products/catalog/brands"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create brand"));
  return res.json() as Promise<CatalogCodeName>;
}

export async function renameBrand(
  code: string,
  name: string
): Promise<CatalogCodeName> {
  const res = await authedFetch(
    productPath(`/api/v1/products/catalog/brands/${encodeURIComponent(code)}`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to rename brand"));
  return res.json() as Promise<CatalogCodeName>;
}

export async function deleteBrand(code: string): Promise<void> {
  const res = await authedFetch(
    productPath(`/api/v1/products/catalog/brands/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete brand"));
}

export async function listStyles(brandCode: string): Promise<CatalogStyle[]> {
  const res = await authedFetch(
    productPath(
      `/api/v1/products/catalog/brands/${encodeURIComponent(brandCode)}/styles`
    )
  );
  return parseCatalogList<CatalogStyle>(res, "Failed to list styles");
}

export async function createStyle(
  brandCode: string,
  code: string,
  name: string
): Promise<CatalogStyle> {
  const res = await authedFetch(
    productPath(
      `/api/v1/products/catalog/brands/${encodeURIComponent(brandCode)}/styles`
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to create style"));
  return res.json() as Promise<CatalogStyle>;
}

export async function renameStyle(
  brandCode: string,
  styleCode: string,
  name: string
): Promise<CatalogStyle> {
  const res = await authedFetch(
    productPath(
      `/api/v1/products/catalog/brands/${encodeURIComponent(brandCode)}/styles/${encodeURIComponent(styleCode)}`
    ),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to rename style"));
  return res.json() as Promise<CatalogStyle>;
}

export async function deleteStyle(
  brandCode: string,
  styleCode: string
): Promise<void> {
  const res = await authedFetch(
    productPath(
      `/api/v1/products/catalog/brands/${encodeURIComponent(brandCode)}/styles/${encodeURIComponent(styleCode)}`
    ),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete style"));
}

export async function listColors(): Promise<CatalogCodeName[]> {
  const res = await authedFetch(productPath("/api/v1/products/catalog/colors"));
  return parseCatalogList<CatalogCodeName>(res, "Failed to list colors");
}

export async function createColor(
  code: string,
  name: string
): Promise<CatalogCodeName> {
  const res = await authedFetch(productPath("/api/v1/products/catalog/colors"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create color"));
  return res.json() as Promise<CatalogCodeName>;
}

export async function renameColor(
  code: string,
  name: string
): Promise<CatalogCodeName> {
  const res = await authedFetch(
    productPath(`/api/v1/products/catalog/colors/${encodeURIComponent(code)}`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to rename color"));
  return res.json() as Promise<CatalogCodeName>;
}

export async function deleteColor(code: string): Promise<void> {
  const res = await authedFetch(
    productPath(`/api/v1/products/catalog/colors/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete color"));
}

export async function listSizes(): Promise<CatalogCodeName[]> {
  const res = await authedFetch(productPath("/api/v1/products/catalog/sizes"));
  return parseCatalogList<CatalogCodeName>(res, "Failed to list sizes");
}

export async function createSize(
  code: string,
  name: string
): Promise<CatalogCodeName> {
  const res = await authedFetch(productPath("/api/v1/products/catalog/sizes"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create size"));
  return res.json() as Promise<CatalogCodeName>;
}

export async function renameSize(
  code: string,
  name: string
): Promise<CatalogCodeName> {
  const res = await authedFetch(
    productPath(`/api/v1/products/catalog/sizes/${encodeURIComponent(code)}`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to rename size"));
  return res.json() as Promise<CatalogCodeName>;
}

export async function deleteSize(code: string): Promise<void> {
  const res = await authedFetch(
    productPath(`/api/v1/products/catalog/sizes/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete size"));
}

export async function listEditions(): Promise<CatalogCodeName[]> {
  const res = await authedFetch(productPath("/api/v1/products/catalog/editions"));
  return parseCatalogList<CatalogCodeName>(res, "Failed to list editions");
}

export async function createEdition(
  code: string,
  name: string
): Promise<CatalogCodeName> {
  const res = await authedFetch(productPath("/api/v1/products/catalog/editions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create edition"));
  return res.json() as Promise<CatalogCodeName>;
}

export async function renameEdition(
  code: string,
  name: string
): Promise<CatalogCodeName> {
  const res = await authedFetch(
    productPath(`/api/v1/products/catalog/editions/${encodeURIComponent(code)}`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to rename edition"));
  return res.json() as Promise<CatalogCodeName>;
}

export async function deleteEdition(code: string): Promise<void> {
  const res = await authedFetch(
    productPath(`/api/v1/products/catalog/editions/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete edition"));
}

// ── Promotional codes ────────────────────────────────────────────────────────
//
// Renamed from "coupon" on 2026-09-16 (dupli1 docs/product-promotion-rename.md).
// These call the canonical `/api/v1/products/promotions…` paths; the backend
// also still answers on the pre-rename `/api/v1/coupons…` prefix for one
// release, which is what lets this repo deploy either side of the backend.

/** Audience. `single_user` needs an entitlement the customer was issued. */
export type PromotionScope = "global" | "single_user";

/**
 * What the code gives. `target` names the Phase 4 shapes too, but the service
 * rejects anything but `goods` on write rather than saving a definition that
 * would silently discount nothing.
 */
export interface PromotionBenefit {
  target: "goods" | "shipping" | "goods_and_shipping" | "none";
  discount_type: "percent" | "fixed" | "none";
  /** 0 < fraction < 1 for a percent benefit. */
  discount_fraction?: number;
  /** Whole KRW for a fixed benefit; clamped to the eligible base at checkout. */
  discount_fixed_won?: number;
  /** Caps a percentage on a large cart. Absent means uncapped. */
  max_discount_won?: number;
  apply_to?: "entire_subtotal" | "eligible_lines" | "shipping_fee";
}

export type ConditionOp = "eq" | "neq" | "in" | "nin" | "gte" | "lte" | "gt" | "lt";

/** One comparison: attr op value. Attributes come from a service allowlist. */
export interface PromotionPredicate {
  attr: string;
  op: ConditionOp;
  value: string | number | boolean | string[] | number[];
}

/** Versioned eligibility document. `version: 0` with no rules = always eligible. */
export interface PromotionConditions {
  version: number;
  all?: PromotionPredicate[];
  exclude?: PromotionPredicate[];
  line_match?: "any" | "all" | "eligible_only";
}

/**
 * What issues a `single_user` code without a manager. `user_registered` grants
 * it to every new customer at sign-up; `""` turns that off. Whether the code
 * can be spent is still `active`, so a campaign can collect sign-ups first.
 */
export type PromotionAutoIssue = "" | "user_registered";

/** How a promotion reaches a checkout: entered as a code, or applied on its own as a tier. */
export type PromotionApplyMode = "code" | "auto";

export interface Promotion {
  code: string;
  scope: PromotionScope;
  description: string;
  active: boolean;
  conditions: PromotionConditions;
  benefit: PromotionBenefit;
  /** RFC3339; enforced. A manager authors a date meaning end-of-day KST. */
  expires_at?: string | null;
  /** Campaign-wide cap on paid uses. Absent means uncapped. */
  max_redemptions?: number | null;
  max_per_customer: number;
  /** Paid uses so far, denormalised from the ledger. */
  redemption_count: number;
  /** How long an issued single-user entitlement lasts. Absent or 0 = no limit of its own. */
  entitlement_ttl_days?: number;
  /** Event that grants this single-user code on its own. Absent = only by hand. */
  auto_issue?: PromotionAutoIssue;
  /**
   * `auto` makes a single-user code a customer tier (VIP, a private tier):
   * members get it on every order without entering it, stacked under one code.
   * Absent or `code` = entered at checkout.
   */
  apply_mode?: PromotionApplyMode;
  /** Customer-facing copy stating what the code requires. */
  terms?: string;
  updated_at?: string;
  /** Pre-Phase-2 columns. Still read so an old row prices correctly; nothing writes them. */
  discount: number;
  expires: string;
}

/**
 * Create/update body. `expires_on` is a `yyyy-mm-dd` date the service reads as
 * the end of that day in Seoul; `""` clears the expiry.
 */
export interface PromotionInput {
  code?: string;
  scope?: PromotionScope;
  description?: string;
  terms?: string;
  active?: boolean;
  benefit?: PromotionBenefit;
  conditions?: PromotionConditions;
  expires_on?: string;
  max_redemptions?: number;
  max_per_customer?: number;
  /** Single-user only; 0 means an issued entitlement has no expiry of its own. */
  entitlement_ttl_days?: number;
  /** Single-user only; the service refuses anything but `""` on a global code. */
  auto_issue?: PromotionAutoIssue;
  /** `auto` needs single_user scope and no campaign cap. */
  apply_mode?: PromotionApplyMode;
}

export type PromotionUpdate = PromotionInput;

export async function getPromotions(): Promise<Promotion[]> {
  const res = await authedFetch(productPath("/api/v1/products/promotions"));
  if (!res.ok)
    throw new Error(await readError(res, "Failed to fetch promotional codes"));
  const data = (await res.json()) as { total?: number; results?: Promotion[] };
  return Array.isArray(data.results) ? data.results : [];
}

export async function createPromotion(
  input: PromotionInput
): Promise<Promotion> {
  const res = await authedFetch(productPath("/api/v1/products/promotions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok)
    throw new Error(await readError(res, "Failed to create promotional code"));
  return res.json() as Promise<Promotion>;
}

export async function updatePromotion(
  code: string,
  input: PromotionUpdate
): Promise<Promotion> {
  const res = await authedFetch(
    productPath(
      `/api/v1/products/promotions/by-code/${encodeURIComponent(code)}`
    ),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!res.ok)
    throw new Error(await readError(res, "Failed to update promotional code"));
  return res.json() as Promise<Promotion>;
}

/**
 * One account's right to use a `single_user` code.
 *
 * The entitlement grants access; the redemption ledger still decides whether
 * it has been spent. Issued automatically on `user.registered`, by a manager
 * here, or in bulk by the backfill command.
 */
export interface PromotionEntitlement {
  id: string;
  customer_id: string;
  code: string;
  /** `system` (registration), `backfill`, or `issue` (a manager). */
  source: string;
  trigger_key?: string;
  issued_by?: string;
  /** Per entitlement, so an account issued late gets the same window. */
  expires_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
}

/**
 * Grants a customer a single-user code.
 *
 * Idempotent on the trigger key, which defaults to one manager issue per
 * customer per code — re-issuing the same code to the same customer returns
 * the entitlement they already have rather than a second one.
 */
export async function issuePromotion(
  code: string,
  customerId: string
): Promise<PromotionEntitlement> {
  const res = await authedFetch(
    productPath(
      `/api/v1/products/promotions/by-code/${encodeURIComponent(code)}/issue`
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId }),
    }
  );
  if (!res.ok)
    throw new Error(await readError(res, "Failed to issue promotional code"));
  return res.json() as Promise<PromotionEntitlement>;
}

/** Withdraws an entitlement. Never rewrites an order that already used it. */
export async function revokePromotionEntitlement(id: string): Promise<void> {
  const res = await authedFetch(
    productPath(`/api/v1/products/promotions/entitlements/${encodeURIComponent(id)}`),
    { method: "DELETE" }
  );
  if (!res.ok)
    throw new Error(await readError(res, "Failed to revoke the entitlement"));
}

export async function deletePromotion(code: string): Promise<void> {
  const res = await authedFetch(
    productPath(
      `/api/v1/products/promotions/by-code/${encodeURIComponent(code)}`
    ),
    { method: "DELETE" }
  );
  if (!res.ok)
    throw new Error(await readError(res, "Failed to delete promotional code"));
}

// ── Orders ───────────────────────────────────────────────────────────────────

/** Full lifecycle, as the order service emits it (see CLAUDE.md → Order). */
export type OrderStatus =
  | "pending"
  | "paid"
  | "confirmed"
  | "in_transit"
  | "delivered"
  | "fulfilled"
  | "disputed"
  | "canceled";

export interface OrderItem {
  sku_id?: string;
  sku: string;
  quantity: number;
  unit_price_won: number;
  /** Captured at order creation from the product catalog. */
  product_name?: string;
  image_url?: string;
  /** False when the variant is no longer sellable (checkout session reads). */
  available?: boolean;
}

/** Immutable shipping location snapshot captured at checkout complete. */
export interface ShippingAddress {
  postal_code: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  province: string;
  /** Korea Personal Customs Clearance Code ("P" + 12 digits); overseas-sourced shipments only. */
  pccc?: string;
}

export interface Order {
  id: string;
  customer_id: string;
  reservation_id: string;
  items: OrderItem[];
  status: OrderStatus;
  /** Canonical since the 2026-09-16 rename; `coupon_code` is the pre-rename alias. */
  promotion_code?: string;
  /** @deprecated Order emits both keys for one release; read `promotion_code`. */
  coupon_code?: string;
  subtotal_won: number;
  /** Whole goods discount, the tier's share included. */
  discount_won: number;
  /** Automatic customer tier (VIP, a private tier) this order earned without a code. */
  tier_promotion_code?: string;
  /** The tier's share of `discount_won`; the code's share is the rest. */
  tier_discount_won?: number;
  /** Flat delivery charge in whole KRW, snapshotted at order creation. */
  shipping_fee_won?: number;
  total_won: number;
  /** Recipient display name from checkout fulfillment snapshot. */
  recipient_name?: string;
  /** KR mobile digits from checkout fulfillment snapshot. */
  recipient_phone?: string;
  shipping_address?: ShippingAddress;
  /** Audit-only link to auth saved address id (optional). */
  source_address_id?: string;
  payment_id?: string;
  paid_at?: string;
  payment_due_at?: string;
  shipped_at?: string;
  shipped_by?: string;
  /** Set when a manager accepts a paid order (or when it ships). */
  confirmed_at?: string;
  confirmation_due_at?: string;
  confirmation_overdue?: boolean;
  cancel_requested_at?: string;
  cancel_request_reason?: string;
  cancel_confirm_due_at?: string;
  cancel_confirm_overdue?: boolean;
  immediate_cancel_allowed?: boolean;
  cancel_request_allowed?: boolean;
  /** Fixed KR carrier code set at ship time (`cj`, `hanjin`, …, `other`). */
  carrier?: string;
  tracking_number?: string;
  /** Free-text carrier name when `carrier` is `other`. */
  carrier_note?: string;
  created_at: string;
  updated_at: string;
}

export type ShipCarrier =
  | "cj"
  | "hanjin"
  | "lotte"
  | "logen"
  | "epost"
  | "other";

export const SHIP_CARRIERS: ShipCarrier[] = [
  "cj",
  "hanjin",
  "lotte",
  "logen",
  "epost",
  "other",
];

export interface ShipOrderInput {
  carrier: ShipCarrier;
  tracking_number: string;
  carrier_note?: string;
}

/** True when the order carries a usable fulfillment snapshot. */
export function orderHasFulfillment(order: Order): boolean {
  return Boolean(
    order.recipient_name?.trim() ||
      order.recipient_phone?.trim() ||
      order.shipping_address?.address_line1?.trim() ||
      order.shipping_address?.postal_code?.trim()
  );
}

export interface OrdersResponse {
  total: number;
  orders: Order[];
}

async function fetchCustomerOrders(customerId: string): Promise<Order[]> {
  const res = await authedFetch(
    orderPath(`/api/v1/orders?customer_id=${encodeURIComponent(customerId)}`)
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to fetch orders"));
  const data = (await res.json()) as OrdersResponse;
  return data.orders ?? [];
}

/** Tell the rest of the console (header badge, open lists) about a change. */
function published(order: Order): Order {
  publishOrderUpdate(order);
  return order;
}

/**
 * Every order, or `null` when the operator may not list them all
 * (`order.read.all`). Unlike `getOrders` there is no per-customer fallback:
 * callers that refresh in the background must not fan out a request per user.
 */
export async function listAllOrders(): Promise<Order[] | null> {
  const res = await authedFetch(orderPath("/api/v1/orders"));
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(await readError(res, "Failed to fetch orders"));
  const data = (await res.json()) as OrdersResponse;
  return data.orders ?? [];
}

async function fetchAllOrders(): Promise<Order[]> {
  // No customer_id → backend lists every order (requires order.read.all).
  const res = await authedFetch(orderPath("/api/v1/orders"));
  if (!res.ok) throw new Error(await readError(res, "Failed to fetch orders"));
  const data = (await res.json()) as OrdersResponse;
  return data.orders ?? [];
}

export async function getOrders(customerId?: string): Promise<Order[]> {
  if (customerId) {
    return fetchCustomerOrders(customerId);
  }

  // Prefer the admin all-orders endpoint (requires order.read.all).
  // Fall back to per-user aggregation when the caller lacks that permission.
  try {
    const orders = await fetchAllOrders();
    orders.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return orders;
  } catch {
    // fall through
  }

  const users = await listUsers().catch(() => [] as AuthUser[]);
  if (users.length === 0) return [];

  const batches = await Promise.all(
    users.map((u) =>
      fetchCustomerOrders(u.user_id).catch(() => [] as Order[])
    )
  );
  const merged = batches.flat();
  merged.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return merged;
}

export async function getOrder(id: string): Promise<Order> {
  const res = await authedFetch(orderPath(`/api/v1/orders/${id}`));
  if (!res.ok) throw new Error(await readError(res, "Order not found"));
  return res.json() as Promise<Order>;
}

/** Ship a confirmed order (`confirmed` → `in_transit`). Requires `order.ship` + tracking. */
export async function shipOrder(
  id: string,
  input: ShipOrderInput
): Promise<Order> {
  const res = await authedFetch(orderPath(`/api/v1/orders/${id}/ship`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      carrier: input.carrier,
      tracking_number: input.tracking_number.trim(),
      ...(input.carrier === "other" && input.carrier_note?.trim()
        ? { carrier_note: input.carrier_note.trim() }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to ship order"));
  return published(await res.json());
}

/** Cancel or fulfill via status API. Use `shipOrder` for `in_transit`. */
export async function updateOrderStatus(
  id: string,
  status: Extract<OrderStatus, "canceled" | "fulfilled">
): Promise<Order> {
  const res = await authedFetch(orderPath(`/api/v1/orders/${id}/status`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to update order"));
  return published(await res.json());
}

/** Manager accepts a paid order. After this, customer cancel needs approval. */
export async function confirmOrder(id: string): Promise<Order> {
  const res = await authedFetch(orderPath(`/api/v1/orders/${id}/confirm`), {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to confirm order"));
  return published(await res.json());
}

/** Mark a shipped order delivered (`in_transit` → `delivered`). Requires `order.ship`. */
export async function deliverOrder(id: string): Promise<Order> {
  const res = await authedFetch(orderPath(`/api/v1/orders/${id}/deliver`), {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to mark delivered"));
  return published(await res.json());
}

/** Close a dispute in the delivery's favor (`disputed` → `fulfilled`, no refund). */
export async function resolveOrderDispute(id: string): Promise<Order> {
  const res = await authedFetch(
    orderPath(`/api/v1/orders/${id}/dispute/resolve`),
    { method: "POST" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to resolve dispute"));
  return published(await res.json());
}

/** Approve a customer cancel request and refund. */
export async function approveOrderCancel(id: string): Promise<Order> {
  const res = await authedFetch(
    orderPath(`/api/v1/orders/${id}/cancel/approve`),
    { method: "POST" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to approve cancel"));
  return published(await res.json());
}

/** Reject a customer cancel request; the order stays in place. */
export async function rejectOrderCancel(id: string): Promise<Order> {
  const res = await authedFetch(
    orderPath(`/api/v1/orders/${id}/cancel/reject`),
    { method: "POST" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to reject cancel"));
  return published(await res.json());
}

// ── Inventory ────────────────────────────────────────────────────────────────

export interface StockItem {
  sku: string;
  quantity: number;
  reserved: number;
  updated_at: string;
}

export async function getInventory(sku: string): Promise<StockItem> {
  const res = await authedFetch(
    inventoryPath(`/api/v1/inventory/${encodeURIComponent(sku)}`)
  );
  if (!res.ok) throw new Error(await readError(res, "Stock item not found"));
  return res.json() as Promise<StockItem>;
}

/** Inventory lookup by canonical ULID `skuId`. */
export async function getInventoryBySkuId(skuId: string): Promise<StockItem> {
  const res = await authedFetch(
    inventoryPath(
      `/api/v1/inventory/by-sku-id/${encodeURIComponent(skuId)}`
    )
  );
  if (!res.ok) throw new Error(await readError(res, "Stock item not found"));
  return res.json() as Promise<StockItem>;
}

/**
 * A variant's stock row, by `skuId` when it has one (falling back to the
 * human SKU), or `null` when inventory has no row or cannot be reached.
 */
export async function getVariantStock(
  variant: Pick<ProductVariant, "sku" | "skuId">
): Promise<StockItem | null> {
  try {
    return variant.skuId
      ? await getInventoryBySkuId(variant.skuId).catch(() =>
          getInventory(variant.sku)
        )
      : await getInventory(variant.sku);
  } catch {
    return null;
  }
}

export async function setInventory(
  sku: string,
  quantity: number
): Promise<StockItem> {
  const res = await authedFetch(
    inventoryPath(`/api/v1/inventory/${encodeURIComponent(sku)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update stock"));
  return res.json() as Promise<StockItem>;
}

/** Set stock by canonical ULID `skuId`. */
export async function setInventoryBySkuId(
  skuId: string,
  quantity: number
): Promise<StockItem> {
  const res = await authedFetch(
    inventoryPath(
      `/api/v1/inventory/by-sku-id/${encodeURIComponent(skuId)}`
    ),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update stock"));
  return res.json() as Promise<StockItem>;
}

export async function adjustInventory(
  sku: string,
  delta: number
): Promise<StockItem> {
  const res = await authedFetch(
    inventoryPath(`/api/v1/inventory/${encodeURIComponent(sku)}/adjust`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to adjust stock"));
  return res.json() as Promise<StockItem>;
}

async function inventoryQuantityForSku(sku: string): Promise<number | null> {
  try {
    const item = await getInventory(sku);
    return item.quantity;
  } catch {
    return null;
  }
}

/** Stock alerts from inventory service keyed by variant SKU. */
export async function getCatalogStockAlerts(): Promise<VariantStockAlert[]> {
  const products = await listAllProducts();
  const rows: VariantStockAlert[] = [];

  await Promise.all(
    products.flatMap((product) =>
      productVariants(product).map(async (variant) => {
        const quantity = await inventoryQuantityForSku(variant.sku);
        if (quantity == null) return;

        rows.push({
          parentId: product.id,
          parentName: product.name,
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          quantity,
          available: Math.max(0, quantity),
        });
      })
    )
  );

  return rows.sort((a, b) => a.parentName.localeCompare(b.parentName));
}

// ── Auth (users) ─────────────────────────────────────────────────────────────

/** Wildcard permission tokens (see shared/pkg/permissions/catalog.go). */
export const PERMISSION_WILDCARDS = [
  "*",
  "admin.*",
  "product.*",
  "promotion.*",
  // Pre-rename; still accepted by the backend for one release, and listed so an
  // operator can see and clear one a manager already holds.
  "coupon.*",
  "user.*",
] as const;

/** Concrete permission catalog, mirrored from shared/pkg/permissions/catalog.go. */
export const PERMISSION_CATALOG = [
  "user.create",
  "user.read",
  "user.permissions.update",
  "user.password.update",
  "user.status.update",
  "user.delete",
  // Service-account API keys (owner only in practice; elug3/dupli1#308).
  "user.apikey.read",
  "user.apikey.manage",
  "product.create",
  "product.update",
  "product.delete",
  "product.read",
  "product.variant.create",
  "product.variant.update",
  "product.variant.delete",
  "product.image.upload",
  "product.master.read",
  "product.master.write",
  "promotion.read",
  "promotion.create",
  "promotion.update",
  "promotion.delete",
  // Moves the usage ledger; held by order's service account, not by people.
  "promotion.redeem",
  // Grants and revokes a single-user entitlement.
  "promotion.issue",
  // Pre-rename, dropped when the compatibility window closes.
  "coupon.read",
  "coupon.create",
  "coupon.update",
  "coupon.delete",
  "inventory.stock.read",
  "inventory.stock.write",
  "inventory.reservation.manage",
  "order.create",
  "order.read.all",
  "order.ship",
  "order.status.update",
  "cart.read",
  "payment.create",
  "payment.read.all",
  "payment.bypass",
  "payment.cancel",
  "notification.telegram.read",
  "notification.telegram.manage",
  // Customer consultation inbox (support service).
  "support.read",
  "support.reply",
  "support.manage",
] as const;

export const ALL_PERMISSIONS = [
  ...PERMISSION_WILDCARDS,
  ...PERMISSION_CATALOG,
] as const;

/**
 * Whether `held` grants `required`, mirroring shared/pkg/permissions `Has`:
 * exact match, a `{resource}.*` wildcard, `admin.*` for `user.*`, or `*`.
 */
export function permissionGrants(held: string[], required: string): boolean {
  return held.some((h) => {
    if (h === required || h === "*") return true;
    if (h === "admin.*") return required.startsWith("user.");
    if (!h.endsWith(".*")) return false;
    const prefix = h.slice(0, -2);
    return (
      prefix !== "" &&
      (required === prefix || required.startsWith(`${prefix}.`))
    );
  });
}

export type AccountType = "customer" | "manager" | "service";

/**
 * Normalize auth API account_type into the manage-web model.
 * Accepts legacy `admin` (mapped to manager) for older rows/tokens.
 */
export function normalizeAccountType(
  value: string | null | undefined
): AccountType {
  switch (value) {
    case "manager":
    case "admin":
      return "manager";
    case "service":
      return "service";
    case "customer":
    default:
      return "customer";
  }
}

/** Map manage-web account type to the auth API wire value. */
export function toApiAccountType(value: AccountType): AccountType {
  return value;
}

export interface AuthUser {
  user_id: string;
  email: string;
  account_type: AccountType;
  permissions: string[];
  is_active: boolean;
  locked_at: string | null;
  failed_login_attempts: number;
  /**
   * False for an account with no password — service accounts, which
   * authenticate with API keys only. Older auth builds omit the field, so it
   * falls back to "anything but a service account".
   */
  has_password: boolean;
}

function mapAuthUser(raw: Record<string, unknown>): AuthUser {
  return {
    user_id: typeof raw.user_id === "string" ? raw.user_id : "",
    email: typeof raw.email === "string" ? raw.email : "",
    account_type: normalizeAccountType(
      typeof raw.account_type === "string" ? raw.account_type : undefined
    ),
    permissions: Array.isArray(raw.permissions)
      ? raw.permissions.filter((p): p is string => typeof p === "string")
      : [],
    is_active: raw.is_active !== false,
    locked_at: typeof raw.locked_at === "string" ? raw.locked_at : null,
    failed_login_attempts:
      typeof raw.failed_login_attempts === "number"
        ? raw.failed_login_attempts
        : 0,
    has_password:
      typeof raw.has_password === "boolean"
        ? raw.has_password
        : raw.account_type !== "service",
  };
}

export function isManagerUser(user: AuthUser): boolean {
  return user.account_type === "manager";
}

export function isCustomerUser(user: AuthUser): boolean {
  return user.account_type === "customer";
}

export function isServiceUser(user: AuthUser): boolean {
  return user.account_type === "service";
}

export function formatPermissions(permissions: string[]): string {
  return permissions.length > 0 ? permissions.join(", ") : "—";
}

export async function listUsers(): Promise<AuthUser[]> {
  const res = await authedFetch(authPath("/api/v1/auth/users"));
  if (!res.ok) throw new Error(await readError(res, "Failed to list users"));
  const data = (await res.json()) as { users?: Record<string, unknown>[] };
  return (data.users ?? []).map(mapAuthUser);
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const users = await listUsers();
  return users.find((user) => user.user_id === userId) ?? null;
}

/**
 * Create an account. Service accounts have no password — they authenticate
 * with API keys minted afterwards — so `password` is sent only for customers
 * and managers.
 */
export async function registerUser(
  email: string,
  accountType: AccountType,
  password?: string
): Promise<{ user_id: string }> {
  const body: Record<string, string> = {
    email,
    account_type: toApiAccountType(accountType),
  };
  if (accountType !== "service" && password) body.password = password;
  const res = await authedFetch(authPath("/api/v1/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to register user"));
  return res.json() as Promise<{ user_id: string }>;
}

export async function setUserPermissions(
  userId: string,
  permissions: string[],
  accountType?: AccountType
): Promise<AuthUser> {
  const res = await authedFetch(
    authPath(`/api/v1/auth/users/${encodeURIComponent(userId)}/permissions`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        accountType
          ? {
              permissions,
              account_type: toApiAccountType(accountType),
            }
          : { permissions }
      ),
    }
  );
  if (!res.ok)
    throw new Error(await readError(res, "Failed to update permissions"));
  const raw = (await res.json()) as Record<string, unknown>;
  return mapAuthUser(raw);
}

export async function setUserPassword(
  userId: string,
  password: string
): Promise<void> {
  const res = await authedFetch(
    authPath(`/api/v1/auth/users/${encodeURIComponent(userId)}/password`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update password"));
}

/**
 * A service account's API key as the management API lists it. The plaintext
 * (`api_key`) exists only on the create response and is never stored.
 */
export interface ServiceApiKey {
  id: string;
  user_id: string;
  name: string;
  /** First 12 chars (`dk_live_A1b2`) — for recognising a key, not using it. */
  prefix: string;
  /** Scope; empty means the key inherits the account's permissions. */
  permissions: string[];
  /** `env` keys are seeded from auth's env and can only be rotated there. */
  source: "api" | "env";
  created_at: string;
  created_by: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface CreateApiKeyRequest {
  name: string;
  /** Omit or `[]` to inherit the account's permissions. */
  permissions?: string[];
  /** Omit for a key that never expires. */
  expires_in_days?: number;
}

export interface CreatedApiKey extends ServiceApiKey {
  /** Plaintext key, returned this once. */
  api_key: string;
}

function optString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function mapApiKey(raw: Record<string, unknown>): ServiceApiKey {
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    user_id: typeof raw.user_id === "string" ? raw.user_id : "",
    name: typeof raw.name === "string" ? raw.name : "",
    prefix: typeof raw.prefix === "string" ? raw.prefix : "",
    permissions: Array.isArray(raw.permissions)
      ? raw.permissions.filter((p): p is string => typeof p === "string")
      : [],
    source: raw.source === "env" ? "env" : "api",
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    created_by: typeof raw.created_by === "string" ? raw.created_by : "",
    expires_at: optString(raw.expires_at),
    last_used_at: optString(raw.last_used_at),
    revoked_at: optString(raw.revoked_at),
  };
}

export async function listApiKeys(userId: string): Promise<ServiceApiKey[]> {
  const res = await authedFetch(
    authPath(`/api/v1/auth/users/${encodeURIComponent(userId)}/api-keys`)
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to load API keys"));
  const data = (await res.json()) as { api_keys?: Record<string, unknown>[] };
  return (data.api_keys ?? []).map(mapApiKey);
}

export async function createApiKey(
  userId: string,
  req: CreateApiKeyRequest
): Promise<CreatedApiKey> {
  const res = await authedFetch(
    authPath(`/api/v1/auth/users/${encodeURIComponent(userId)}/api-keys`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to create API key"));
  const raw = (await res.json()) as Record<string, unknown>;
  return {
    ...mapApiKey(raw),
    api_key: typeof raw.api_key === "string" ? raw.api_key : "",
  };
}

export async function revokeApiKey(keyId: string): Promise<void> {
  const res = await authedFetch(
    authPath(`/api/v1/auth/api-keys/${encodeURIComponent(keyId)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to revoke API key"));
}

export async function setUserStatus(
  userId: string,
  isActive: boolean
): Promise<AuthUser> {
  const res = await authedFetch(
    authPath(`/api/v1/auth/users/${encodeURIComponent(userId)}/status`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: isActive }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update status"));
  const raw = (await res.json()) as Record<string, unknown>;
  return mapAuthUser(raw);
}

// ── Dashboard / Analytics ──────────────────────────────────────────────────────

export interface DashboardStats {
  productCount: number;
  orderCount: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [products, orders] = await Promise.all([
    getProducts().catch(() => [] as Product[]),
    getOrders().catch(() => [] as Order[]),
  ]);
  return { productCount: products.length, orderCount: orders.length };
}

// ── Reports (sales, sign-ups and visitors) ───────────────────────────────────
// All three are bucketed server-side into the same KST periods: weeks run Monday to
// Sunday, months are calendar months. Backend docs/api.md.

export type ReportGranularity = "week" | "month";

/** One week or month of `GET /api/v1/orders/reports/sales`. */
export interface SalesPeriod {
  period_start: string; // YYYY-MM-DD, first day
  period_end: string; // YYYY-MM-DD, last day (inclusive)
  /** Orders paid in the period, and their amounts. */
  orders: number;
  gross_won: number;
  discount_won: number;
  shipping_fee_won: number;
  /** Paid orders canceled (refunded) in the period, whenever they were paid. */
  refunds: number;
  refunded_won: number;
  /** gross_won - refunded_won: what moved in the period. */
  net_won: number;
  average_order_won: number;
}

export interface SalesReport {
  granularity: ReportGranularity;
  timezone: string;
  from: string;
  to: string;
  periods: SalesPeriod[];
  totals: SalesPeriod;
}

/** One week or month of `GET /api/v1/auth/reports/registrations`. */
export interface RegistrationPeriod {
  period_start: string;
  period_end: string;
  new_customers: number;
}

export interface RegistrationReport {
  granularity: ReportGranularity;
  timezone: string;
  from: string;
  to: string;
  periods: RegistrationPeriod[];
  total_new_customers: number;
  /** Customers who signed up before auth recorded sign-up dates. */
  undated_customers: number;
}

/** One week or month of `GET /api/v1/products/reports/visitors`. */
export interface VisitorPeriod {
  period_start: string;
  period_end: string;
  /** Browsers that visited at least once in the period. */
  unique_visitors: number;
  /** Each browser once per day it came: the sum of daily unique visitors. */
  visitor_days: number;
}

/**
 * Storefront unique visitors. A visitor is a browser (the `dupli1_guest`
 * cookie), counted once per KST day by the storefront's page-load beacon, so
 * one person on two devices counts twice. Counting began when the beacon
 * shipped; there is no earlier history.
 */
export interface VisitorReport {
  granularity: ReportGranularity;
  timezone: string;
  from: string;
  to: string;
  periods: VisitorPeriod[];
  /** Each browser once across the whole range — not the sum of the periods. */
  total_unique_visitors: number;
  /** The current KST day, whatever range was asked for. */
  today: { date: string; unique_visitors: number };
}

function reportQuery(granularity: ReportGranularity, from?: string, to?: string) {
  const q = new URLSearchParams({ granularity });
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  return q.toString();
}

/** Sales per week or month (`order.read.all`). `null` when the caller lacks it. */
export async function getSalesReport(
  granularity: ReportGranularity,
  from?: string,
  to?: string
): Promise<SalesReport | null> {
  const res = await authedFetch(
    orderPath(`/api/v1/orders/reports/sales?${reportQuery(granularity, from, to)}`)
  );
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(await readError(res, "Failed to load sales report"));
  return (await res.json()) as SalesReport;
}

/** Customer sign-ups per week or month (`user.read`). `null` when the caller lacks it. */
export async function getRegistrationReport(
  granularity: ReportGranularity,
  from?: string,
  to?: string
): Promise<RegistrationReport | null> {
  const res = await authedFetch(
    authPath(`/api/v1/auth/reports/registrations?${reportQuery(granularity, from, to)}`)
  );
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(await readError(res, "Failed to load sign-up report"));
  return (await res.json()) as RegistrationReport;
}

/** Unique storefront visitors per week or month (`product.read`). `null` when the caller lacks it. */
export async function getVisitorReport(
  granularity: ReportGranularity,
  from?: string,
  to?: string
): Promise<VisitorReport | null> {
  const res = await authedFetch(
    productPath(`/api/v1/products/reports/visitors?${reportQuery(granularity, from, to)}`)
  );
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(await readError(res, "Failed to load visitor report"));
  return (await res.json()) as VisitorReport;
}

/**
 * Paid orders per unique visitor, as a percentage, or `null` with no visitors.
 * Both come from different reports bucketed into the same KST periods.
 */
export function conversionRate(paidOrders: number, uniqueVisitors: number): number | null {
  if (uniqueVisitors <= 0) return null;
  return (paidOrders / uniqueVisitors) * 100;
}

// ── Notification (Telegram ops bot) ──────────────────────────────────────────
// Wire types only — fetches live in `app/lib/server/notification.server.ts`
// and are invoked from the `/telegram` route loader/action (SSR), so the
// browser never calls `/notification/api/v1/notification/…`.

export type TelegramSubscriptionStatus = "pending" | "accepted" | "rejected";

/** A Telegram user or chat registered for ops alerts (notification service). */
export interface TelegramSubscription {
  id: string;
  telegram_user_id?: number;
  chat_id: string;
  chat_type?: string;
  chat_label?: string;
  username?: string;
  status: TelegramSubscriptionStatus;
  alert_order: boolean;
  alert_product: boolean;
  /** Customer inquiry handoffs from the support bot. */
  alert_support: boolean;
  /**
   * Single messages this chat does not receive inside a class it is on, e.g.
   * `order.created` while keeping `order.paid`. Absent from a notification
   * service that predates per-message mutes (backend dupli1 #332).
   */
  muted_events?: string[];
  created_at: string;
  updated_at: string;
  accepted_at?: string;
  accepted_by?: string;
}

/** Which event streams a subscription receives. */
export interface TelegramAlertFlags {
  alert_order: boolean;
  alert_product: boolean;
  alert_support: boolean;
}

/** Alert flags plus the muted messages, as PATCH and accept take them. */
export interface TelegramAlertSettings extends TelegramAlertFlags {
  /** Replaces the whole list when sent; omitted keeps it as it is. */
  muted_events?: string[];
}

/**
 * The messages a chat can mute, by the class they belong to — the NATS
 * subjects the notification service alerts on. Support handoffs cannot be
 * muted.
 */
export const TELEGRAM_ALERT_EVENTS = {
  alert_order: [
    "order.created",
    "order.paid",
    "order.status_updated",
    "payment.canceled",
    "payment.callback_rejected",
  ],
  alert_product: [
    "product.created",
    "product.updated",
    "product.deleted",
    "product.image_uploaded",
  ],
} as const;

export type TelegramAlertEvent =
  (typeof TELEGRAM_ALERT_EVENTS)[keyof typeof TELEGRAM_ALERT_EVENTS][number];

export interface TelegramSubscriptionInput extends TelegramAlertFlags {
  telegram_user_id?: number;
  chat_id?: string;
  chat_label?: string;
}

/** Runtime flags from `GET /api/v1/notification/settings` (no secrets). */
export interface NotificationSettings {
  service: string;
  api_version: string;
  features?: Record<string, boolean>;
}
