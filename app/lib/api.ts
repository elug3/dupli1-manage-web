import { authedFetch } from "./auth";
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
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price?: number;
  stock?: number;
  description?: string;
  brand?: string;
  /** Immutable master brand code (e.g. BOT). */
  brandCode?: string;
  /** Immutable master style code under brand (e.g. CAS001). */
  styleCode?: string;
  color?: string;
  material?: string;
  sku?: string;
  status?: string;
  imageUrls?: string[];
  /** Parent catalog summaries (variant model). */
  availableColors?: string[];
  availableSizes?: string[];
  defaultImageUrl?: string;
  priceFrom?: number;
  variants?: ProductVariant[];
  raw: ProductSearchHit;
}

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
  price: number;
  status: string;
  imageUrls: string[];
  inStock?: boolean;
  raw: ProductSearchHit;
}

/** Master-data dictionary entry (`/api/v1/catalog/...`). */
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
    price: hitNumber(hit, "price") ?? 0,
    status: hitString(hit, "status") ?? "active",
    imageUrls: hitStringArray(hit, "imageUrls") ?? [],
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
  const value = product.priceFrom ?? product.price;
  if (value == null) return null;
  const formatted = new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
  return product.priceFrom != null ? `From ${formatted}` : formatted;
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
      hitNumber(hit, "priceFrom") ??
      hitNumber(hit, "price_from") ??
      hitNumber(hit, "price") ??
      hitNumber(hit, "unit_price_cents"),
    stock: hitNumber(hit, "stock") ?? hitNumber(hit, "quantity"),
    description: hitString(hit, "description"),
    brand: hitString(hit, "brand"),
    brandCode: hitString(hit, "brandCode") ?? hitString(hit, "brand_code"),
    styleCode: hitString(hit, "styleCode") ?? hitString(hit, "style_code"),
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
    priceFrom:
      hitNumber(hit, "priceFrom") ?? hitNumber(hit, "price_from"),
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

/** List all products (all statuses when authenticated with product.read). */
export async function listAllProducts(): Promise<Product[]> {
  const res = await authedFetch(productPath("/api/v1/products"));
  if (!res.ok) throw new Error(await readError(res, "Failed to list products"));
  const data = (await res.json()) as ProductSearchResponse;
  const hits = Array.isArray(data.results) ? data.results : [];
  return hits.map((hit, i) => mapProduct(hit, undefined, i));
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
  file: File
): Promise<ProductVariant> {
  const form = new FormData();
  form.append("image", file);
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
  price: number;
  /** Optional display names; backend enriches from masters when blank. */
  color?: string;
  size?: string;
  status?: string;
}

export async function createVariant(
  productId: string,
  input: CreateVariantInput
): Promise<ProductVariant> {
  const res = await authedFetch(
    productPath(
      `/api/v1/products/${encodeURIComponent(productId)}/variants`
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        colorCode: input.colorCode,
        sizeCode: input.sizeCode,
        editionCode: input.editionCode || undefined,
        color: input.color,
        size: input.size,
        price: input.price,
        status: input.status ?? "active",
      }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to create variant"));
  const hit = (await res.json()) as ProductSearchHit;
  return mapVariant(hit);
}

export interface UpdateVariantInput {
  color?: string;
  size?: string;
  price?: number;
  status?: string;
  /** Replaces the variant gallery when non-empty. Empty arrays are ignored by the API merge. */
  imageUrls?: string[];
}

export async function updateVariant(
  productId: string,
  sku: string,
  input: UpdateVariantInput
): Promise<ProductVariant> {
  const res = await authedFetch(
    productPath(
      `/api/v1/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(sku)}`
    ),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
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
  price?: number;
  cost?: number;
  brand?: string;
  color?: string;
  material?: string;
  stock?: number;
  category?: string;
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

export async function listBrands(): Promise<CatalogCodeName[]> {
  const res = await authedFetch(productPath("/api/v1/catalog/brands"));
  return parseCatalogList<CatalogCodeName>(res, "Failed to list brands");
}

export async function createBrand(
  code: string,
  name: string
): Promise<CatalogCodeName> {
  const res = await authedFetch(productPath("/api/v1/catalog/brands"), {
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
    productPath(`/api/v1/catalog/brands/${encodeURIComponent(code)}`),
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
    productPath(`/api/v1/catalog/brands/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete brand"));
}

export async function listStyles(brandCode: string): Promise<CatalogStyle[]> {
  const res = await authedFetch(
    productPath(
      `/api/v1/catalog/brands/${encodeURIComponent(brandCode)}/styles`
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
      `/api/v1/catalog/brands/${encodeURIComponent(brandCode)}/styles`
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
      `/api/v1/catalog/brands/${encodeURIComponent(brandCode)}/styles/${encodeURIComponent(styleCode)}`
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
      `/api/v1/catalog/brands/${encodeURIComponent(brandCode)}/styles/${encodeURIComponent(styleCode)}`
    ),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete style"));
}

export async function listColors(): Promise<CatalogCodeName[]> {
  const res = await authedFetch(productPath("/api/v1/catalog/colors"));
  return parseCatalogList<CatalogCodeName>(res, "Failed to list colors");
}

export async function createColor(
  code: string,
  name: string
): Promise<CatalogCodeName> {
  const res = await authedFetch(productPath("/api/v1/catalog/colors"), {
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
    productPath(`/api/v1/catalog/colors/${encodeURIComponent(code)}`),
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
    productPath(`/api/v1/catalog/colors/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete color"));
}

export async function listSizes(): Promise<CatalogCodeName[]> {
  const res = await authedFetch(productPath("/api/v1/catalog/sizes"));
  return parseCatalogList<CatalogCodeName>(res, "Failed to list sizes");
}

export async function createSize(
  code: string,
  name: string
): Promise<CatalogCodeName> {
  const res = await authedFetch(productPath("/api/v1/catalog/sizes"), {
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
    productPath(`/api/v1/catalog/sizes/${encodeURIComponent(code)}`),
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
    productPath(`/api/v1/catalog/sizes/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete size"));
}

export async function listEditions(): Promise<CatalogCodeName[]> {
  const res = await authedFetch(productPath("/api/v1/catalog/editions"));
  return parseCatalogList<CatalogCodeName>(res, "Failed to list editions");
}

export async function createEdition(
  code: string,
  name: string
): Promise<CatalogCodeName> {
  const res = await authedFetch(productPath("/api/v1/catalog/editions"), {
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
    productPath(`/api/v1/catalog/editions/${encodeURIComponent(code)}`),
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
    productPath(`/api/v1/catalog/editions/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete edition"));
}

// ── Coupons ──────────────────────────────────────────────────────────────────

export interface Coupon {
  code: string;
  discount: number;
  description: string;
  expires: string;
  active: boolean;
}

export interface CouponInput {
  code: string;
  discount: number;
  description?: string;
  expires?: string;
  active?: boolean;
}

export interface CouponUpdate {
  discount?: number;
  description?: string;
  expires?: string;
  active?: boolean;
}

export async function getCoupons(): Promise<Coupon[]> {
  const res = await authedFetch(productPath("/api/v1/coupons"));
  if (!res.ok) throw new Error(await readError(res, "Failed to fetch coupons"));
  const data = (await res.json()) as { total?: number; results?: Coupon[] };
  return Array.isArray(data.results) ? data.results : [];
}

export async function createCoupon(input: CouponInput): Promise<Coupon> {
  const res = await authedFetch(productPath("/api/v1/coupons"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create coupon"));
  return res.json() as Promise<Coupon>;
}

export async function updateCoupon(
  code: string,
  input: CouponUpdate
): Promise<Coupon> {
  const res = await authedFetch(
    productPath(`/api/v1/coupons/${encodeURIComponent(code)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update coupon"));
  return res.json() as Promise<Coupon>;
}

export async function deleteCoupon(code: string): Promise<void> {
  const res = await authedFetch(
    productPath(`/api/v1/coupons/${encodeURIComponent(code)}`),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to delete coupon"));
}

// ── Orders ───────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "pending"
  | "paid"
  | "in_transit"
  | "fulfilled"
  | "canceled";

export interface OrderItem {
  sku: string;
  quantity: number;
  unit_price_cents: number;
}

export interface Order {
  id: string;
  customer_id: string;
  reservation_id: string;
  items: OrderItem[];
  status: OrderStatus;
  coupon_code?: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  created_at: string;
  updated_at: string;
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

export async function getOrders(customerId?: string): Promise<Order[]> {
  if (customerId) {
    return fetchCustomerOrders(customerId);
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

/** Ship a paid order (`paid` → `in_transit`). Requires `order.ship`. */
export async function shipOrder(id: string): Promise<Order> {
  const res = await authedFetch(orderPath(`/api/v1/orders/${id}/ship`), {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to ship order"));
  return res.json() as Promise<Order>;
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
  return res.json() as Promise<Order>;
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
] as const;

export const ALL_PERMISSIONS = [
  ...PERMISSION_WILDCARDS,
  ...PERMISSION_CATALOG,
] as const;

export type AccountType = "customer" | "admin" | "service";

export interface AuthUser {
  user_id: string;
  email: string;
  account_type: AccountType;
  permissions: string[];
  is_active: boolean;
  locked_at: string | null;
  failed_login_attempts: number;
}

export function isManagerUser(user: AuthUser): boolean {
  return user.account_type !== "customer";
}

export function isCustomerUser(user: AuthUser): boolean {
  return user.account_type === "customer";
}

export function formatPermissions(permissions: string[]): string {
  return permissions.length > 0 ? permissions.join(", ") : "—";
}

export async function listUsers(): Promise<AuthUser[]> {
  const res = await authedFetch(authPath("/api/v1/auth/users"));
  if (!res.ok) throw new Error(await readError(res, "Failed to list users"));
  const data = (await res.json()) as { users?: AuthUser[] };
  return data.users ?? [];
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const users = await listUsers();
  return users.find((user) => user.user_id === userId) ?? null;
}

export async function registerUser(
  email: string,
  password: string
): Promise<{ user_id: string }> {
  const res = await authedFetch(authPath("/api/v1/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
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
        accountType ? { permissions, account_type: accountType } : { permissions }
      ),
    }
  );
  if (!res.ok)
    throw new Error(await readError(res, "Failed to update permissions"));
  return res.json() as Promise<AuthUser>;
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
  return res.json() as Promise<AuthUser>;
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

export interface AnalyticsSummary {
  revenue7d: number;
  revenue30d: number;
  orders7d: number;
  orders30d: number;
}

export async function getAnalytics(): Promise<AnalyticsSummary | null> {
  const orders = await getOrders();
  if (orders.length === 0) return null;

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const within = (days: number) => (o: Order) =>
    now - new Date(o.created_at).getTime() <= days * day;

  const sumRevenue = (list: Order[]) =>
    list.reduce((sum, o) => sum + o.total_cents, 0);

  const last7 = orders.filter(within(7));
  const last30 = orders.filter(within(30));

  return {
    revenue7d: sumRevenue(last7),
    revenue30d: sumRevenue(last30),
    orders7d: last7.length,
    orders30d: last30.length,
  };
}
