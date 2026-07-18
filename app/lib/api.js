import { authedFetch } from "./auth";
import { authPath, inventoryPath, orderPath, productPath, } from "./gateway";
function hitId(hit, index) {
    const id = hit.id ?? hit.sku ?? hit.title;
    return typeof id === "string" ? id : `item-${index}`;
}
function hitName(hit) {
    const name = hit.name ?? hit.title ?? hit.sku;
    return typeof name === "string" ? name : "Untitled";
}
function hitNumber(hit, key) {
    const value = hit[key];
    return typeof value === "number" ? value : undefined;
}
function hitString(hit, key) {
    const value = hit[key];
    return typeof value === "string" ? value : undefined;
}
function hitStringArray(hit, key) {
    const value = hit[key];
    if (!Array.isArray(value))
        return undefined;
    const strings = value.filter((v) => typeof v === "string");
    return strings.length > 0 ? strings : undefined;
}
function mapVariant(hit) {
    const sku = hitString(hit, "sku") ?? hitString(hit, "id") ?? "unknown-sku";
    return {
        skuId: hitString(hit, "skuId") ?? hitString(hit, "sku_id"),
        sku,
        productId: hitString(hit, "product_id") ?? hitString(hit, "productId"),
        color: hitString(hit, "color") ?? "",
        size: hitString(hit, "size") ?? "",
        colorCode: hitString(hit, "colorCode") ?? hitString(hit, "color_code"),
        sizeCode: hitString(hit, "sizeCode") ?? hitString(hit, "size_code"),
        editionCode: hitString(hit, "editionCode") ?? hitString(hit, "edition_code"),
        price: hitNumber(hit, "price") ?? 0,
        status: hitString(hit, "status") ?? "active",
        imageUrls: hitStringArray(hit, "imageUrls") ?? [],
        inStock: typeof hit.inStock === "boolean"
            ? hit.inStock
            : typeof hit.in_stock === "boolean"
                ? hit.in_stock
                : undefined,
        raw: hit,
    };
}
function mapVariantsFromHit(hit) {
    const raw = hit.variants;
    if (!Array.isArray(raw) || raw.length === 0)
        return undefined;
    return raw
        .filter((v) => v != null && typeof v === "object")
        .map((v) => mapVariant(v));
}
/** Legacy flat product → single sellable variant (backfill-compatible). */
export function legacyVariantFromProduct(product) {
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
export function productVariants(product) {
    if (product.variants && product.variants.length > 0) {
        return product.variants;
    }
    return [legacyVariantFromProduct(product)];
}
/** Resolve a variant by canonical skuId, falling back to human sku. */
export function findVariant(product, skuIdOrSku) {
    const variants = productVariants(product);
    return (variants.find((v) => v.skuId === skuIdOrSku) ??
        variants.find((v) => v.sku === skuIdOrSku));
}
/** Admin SKU detail path: `/products/{productId}/SKU/{skuId}`. */
export function productSkuPath(productId, skuIdOrSku) {
    return `/products/${encodeURIComponent(productId)}/SKU/${encodeURIComponent(skuIdOrSku)}`;
}
export function formatVariantOption(variant) {
    const parts = [variant.color, variant.size].filter(Boolean);
    return parts.length > 0 ? parts.join(" / ") : variant.sku;
}
export function formatProductColors(product) {
    if (product.availableColors && product.availableColors.length > 0) {
        return product.availableColors.join(", ");
    }
    if (product.color)
        return product.color;
    return "—";
}
export function productVariantCount(product) {
    if (product.variants && product.variants.length > 0) {
        return product.variants.length;
    }
    return 1;
}
export function productListPrice(product) {
    const value = product.priceFrom ?? product.price;
    if (value == null)
        return null;
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
export function productImageSrc(url) {
    if (!url || url.startsWith("/"))
        return url;
    try {
        const parsed = new URL(url);
        if (parsed.pathname.startsWith("/product-images/")) {
            return `${parsed.pathname}${parsed.search}`;
        }
    }
    catch {
        // Relative or opaque strings — use as-is.
    }
    return url;
}
/** Best-effort thumbnail for list cards (parent default or first variant image). */
export function productPreviewImage(product) {
    let url = null;
    if (product.defaultImageUrl)
        url = product.defaultImageUrl;
    else if (product.imageUrls && product.imageUrls.length > 0) {
        url = product.imageUrls[0];
    }
    else {
        for (const variant of productVariants(product)) {
            if (variant.imageUrls.length > 0) {
                url = variant.imageUrls[0];
                break;
            }
        }
    }
    return url ? productImageSrc(url) : null;
}
/** Map variant SKU → parent product and option labels (for order line items). */
export function buildVariantSkuIndex(products) {
    const index = new Map();
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
export function formatOrderItemVariant(sku, lookup) {
    const ctx = lookup.get(sku);
    if (!ctx)
        return null;
    const option = [ctx.color, ctx.size].filter(Boolean).join(" / ");
    return option || null;
}
export function mapProduct(hit, category, index = 0) {
    const variants = mapVariantsFromHit(hit);
    const defaultImageUrl = hitString(hit, "defaultImageUrl") ??
        hitString(hit, "default_image_url") ??
        variants?.[0]?.imageUrls[0];
    return {
        id: hitId(hit, index),
        name: hitName(hit),
        category: category ?? hitString(hit, "category") ?? "bags",
        price: hitNumber(hit, "priceFrom") ??
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
        imageUrls: hitStringArray(hit, "imageUrls") ??
            (defaultImageUrl ? [defaultImageUrl] : undefined),
        availableColors: hitStringArray(hit, "availableColors") ??
            hitStringArray(hit, "available_colors"),
        availableSizes: hitStringArray(hit, "availableSizes") ??
            hitStringArray(hit, "available_sizes"),
        defaultImageUrl,
        priceFrom: hitNumber(hit, "priceFrom") ?? hitNumber(hit, "price_from"),
        variants,
        raw: hit,
    };
}
async function readError(res, fallback) {
    try {
        const body = (await res.json());
        return body.error ?? fallback;
    }
    catch {
        return fallback;
    }
}
/** List all products (all statuses when authenticated with product.read). */
export async function listAllProducts() {
    const res = await authedFetch(productPath("/api/v1/products"));
    if (!res.ok)
        throw new Error(await readError(res, "Failed to list products"));
    const data = (await res.json());
    const hits = Array.isArray(data.results) ? data.results : [];
    return hits.map((hit, i) => mapProduct(hit, undefined, i));
}
export async function getProducts() {
    return listAllProducts();
}
/** Parent + embedded variants; falls back to the all-status list for drafts/archived. */
export async function getManageProduct(id) {
    try {
        return await getProductDetail(id);
    }
    catch {
        const all = await listAllProducts();
        const found = all.find((p) => p.id === id || p.sku === id);
        if (!found)
            throw new Error("Product not found");
        return found;
    }
}
/** Parent + embedded variants (admin/public PDP shape). */
export async function getProductDetail(id) {
    const res = await authedFetch(productPath(`/api/v1/products/${encodeURIComponent(id)}`));
    if (!res.ok)
        throw new Error(await readError(res, "Product not found"));
    const hit = (await res.json());
    return mapProduct(hit);
}
export async function uploadProductImage(id, file) {
    const form = new FormData();
    form.append("image", file);
    const res = await authedFetch(productPath(`/api/v1/products/${encodeURIComponent(id)}/images`), { method: "POST", body: form });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to upload image"));
    const hit = (await res.json());
    return mapProduct(hit);
}
export async function uploadVariantImage(productId, sku, file) {
    const form = new FormData();
    form.append("image", file);
    const res = await authedFetch(productPath(`/api/v1/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(sku)}/images`), { method: "POST", body: form });
    if (!res.ok) {
        throw new Error(await readError(res, "Failed to upload variant image"));
    }
    const hit = (await res.json());
    return mapVariant(hit);
}
export async function createProductParent(input) {
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
    if (!res.ok)
        throw new Error(await readError(res, "Failed to create product"));
    const hit = (await res.json());
    return mapProduct(hit, input.category ?? "bags");
}
export async function createVariant(productId, input) {
    const res = await authedFetch(productPath(`/api/v1/products/${encodeURIComponent(productId)}/variants`), {
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
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to create variant"));
    const hit = (await res.json());
    return mapVariant(hit);
}
export async function updateVariant(productId, sku, input) {
    const res = await authedFetch(productPath(`/api/v1/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(sku)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to update variant"));
    const hit = (await res.json());
    return mapVariant(hit);
}
/**
 * Removes one image URL from a variant gallery.
 * When other images remain, PUTs the filtered list. Clearing the final image is
 * unsupported by the API merge (empty imageUrls is treated as "omit").
 * Callers should surface `LAST_IMAGE` via i18n (`productDetail.cannotDeleteLastImage`).
 */
export class LastImageDeleteError extends Error {
    code = "LAST_IMAGE";
    constructor() {
        super("LAST_IMAGE");
        this.name = "LastImageDeleteError";
    }
}
export async function deleteVariantImage(productId, sku, imageUrl, currentUrls) {
    const next = currentUrls.filter((url) => url !== imageUrl);
    if (next.length === currentUrls.length) {
        throw new Error("Image not found on variant");
    }
    if (next.length === 0) {
        throw new LastImageDeleteError();
    }
    return updateVariant(productId, sku, { imageUrls: next });
}
export async function deleteVariant(productId, sku) {
    const res = await authedFetch(productPath(`/api/v1/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(sku)}`), { method: "DELETE" });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to delete variant"));
}
/** Legacy flat create (single SKU); prefer createProductParent + createVariant. */
export async function createBagProduct(input) {
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
    if (!res.ok)
        throw new Error(await readError(res, "Failed to create product"));
    const hit = (await res.json());
    return mapProduct(hit, "bags");
}
export async function updateProduct(id, input) {
    const res = await authedFetch(productPath(`/api/v1/products/${encodeURIComponent(id)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to update product"));
    const hit = (await res.json());
    return mapProduct(hit);
}
export async function deleteProduct(id) {
    const res = await authedFetch(productPath(`/api/v1/products/${encodeURIComponent(id)}`), { method: "DELETE" });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to delete product"));
}
// ── Catalog master data (SKU dictionaries) ─────────────────────────────────────
async function parseCatalogList(res, fallback) {
    if (!res.ok)
        throw new Error(await readError(res, fallback));
    const data = (await res.json());
    if (Array.isArray(data))
        return data;
    return Array.isArray(data.results) ? data.results : [];
}
export async function listBrands() {
    const res = await authedFetch(productPath("/api/v1/catalog/brands"));
    return parseCatalogList(res, "Failed to list brands");
}
export async function createBrand(code, name) {
    const res = await authedFetch(productPath("/api/v1/catalog/brands"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to create brand"));
    return res.json();
}
export async function renameBrand(code, name) {
    const res = await authedFetch(productPath(`/api/v1/catalog/brands/${encodeURIComponent(code)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to rename brand"));
    return res.json();
}
export async function deleteBrand(code) {
    const res = await authedFetch(productPath(`/api/v1/catalog/brands/${encodeURIComponent(code)}`), { method: "DELETE" });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to delete brand"));
}
export async function listStyles(brandCode) {
    const res = await authedFetch(productPath(`/api/v1/catalog/brands/${encodeURIComponent(brandCode)}/styles`));
    return parseCatalogList(res, "Failed to list styles");
}
export async function createStyle(brandCode, code, name) {
    const res = await authedFetch(productPath(`/api/v1/catalog/brands/${encodeURIComponent(brandCode)}/styles`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to create style"));
    return res.json();
}
export async function renameStyle(brandCode, styleCode, name) {
    const res = await authedFetch(productPath(`/api/v1/catalog/brands/${encodeURIComponent(brandCode)}/styles/${encodeURIComponent(styleCode)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to rename style"));
    return res.json();
}
export async function deleteStyle(brandCode, styleCode) {
    const res = await authedFetch(productPath(`/api/v1/catalog/brands/${encodeURIComponent(brandCode)}/styles/${encodeURIComponent(styleCode)}`), { method: "DELETE" });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to delete style"));
}
export async function listColors() {
    const res = await authedFetch(productPath("/api/v1/catalog/colors"));
    return parseCatalogList(res, "Failed to list colors");
}
export async function createColor(code, name) {
    const res = await authedFetch(productPath("/api/v1/catalog/colors"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to create color"));
    return res.json();
}
export async function renameColor(code, name) {
    const res = await authedFetch(productPath(`/api/v1/catalog/colors/${encodeURIComponent(code)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to rename color"));
    return res.json();
}
export async function deleteColor(code) {
    const res = await authedFetch(productPath(`/api/v1/catalog/colors/${encodeURIComponent(code)}`), { method: "DELETE" });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to delete color"));
}
export async function listSizes() {
    const res = await authedFetch(productPath("/api/v1/catalog/sizes"));
    return parseCatalogList(res, "Failed to list sizes");
}
export async function createSize(code, name) {
    const res = await authedFetch(productPath("/api/v1/catalog/sizes"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to create size"));
    return res.json();
}
export async function renameSize(code, name) {
    const res = await authedFetch(productPath(`/api/v1/catalog/sizes/${encodeURIComponent(code)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to rename size"));
    return res.json();
}
export async function deleteSize(code) {
    const res = await authedFetch(productPath(`/api/v1/catalog/sizes/${encodeURIComponent(code)}`), { method: "DELETE" });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to delete size"));
}
export async function listEditions() {
    const res = await authedFetch(productPath("/api/v1/catalog/editions"));
    return parseCatalogList(res, "Failed to list editions");
}
export async function createEdition(code, name) {
    const res = await authedFetch(productPath("/api/v1/catalog/editions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to create edition"));
    return res.json();
}
export async function renameEdition(code, name) {
    const res = await authedFetch(productPath(`/api/v1/catalog/editions/${encodeURIComponent(code)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to rename edition"));
    return res.json();
}
export async function deleteEdition(code) {
    const res = await authedFetch(productPath(`/api/v1/catalog/editions/${encodeURIComponent(code)}`), { method: "DELETE" });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to delete edition"));
}
export async function getCoupons() {
    const res = await authedFetch(productPath("/api/v1/coupons"));
    if (!res.ok)
        throw new Error(await readError(res, "Failed to fetch coupons"));
    const data = (await res.json());
    return Array.isArray(data.results) ? data.results : [];
}
export async function createCoupon(input) {
    const res = await authedFetch(productPath("/api/v1/coupons"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to create coupon"));
    return res.json();
}
export async function updateCoupon(code, input) {
    const res = await authedFetch(productPath(`/api/v1/coupons/${encodeURIComponent(code)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to update coupon"));
    return res.json();
}
export async function deleteCoupon(code) {
    const res = await authedFetch(productPath(`/api/v1/coupons/${encodeURIComponent(code)}`), { method: "DELETE" });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to delete coupon"));
}
async function fetchCustomerOrders(customerId) {
    const res = await authedFetch(orderPath(`/api/v1/orders?customer_id=${encodeURIComponent(customerId)}`));
    if (!res.ok)
        throw new Error(await readError(res, "Failed to fetch orders"));
    const data = (await res.json());
    return data.orders ?? [];
}
export async function getOrders(customerId) {
    if (customerId) {
        return fetchCustomerOrders(customerId);
    }
    const users = await listUsers().catch(() => []);
    if (users.length === 0)
        return [];
    const batches = await Promise.all(users.map((u) => fetchCustomerOrders(u.user_id).catch(() => [])));
    const merged = batches.flat();
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return merged;
}
export async function getOrder(id) {
    const res = await authedFetch(orderPath(`/api/v1/orders/${id}`));
    if (!res.ok)
        throw new Error(await readError(res, "Order not found"));
    return res.json();
}
/** Ship a paid order (`paid` → `in_transit`). Requires `order.ship`. */
export async function shipOrder(id) {
    const res = await authedFetch(orderPath(`/api/v1/orders/${id}/ship`), {
        method: "POST",
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to ship order"));
    return res.json();
}
/** Cancel or fulfill via status API. Use `shipOrder` for `in_transit`. */
export async function updateOrderStatus(id, status) {
    const res = await authedFetch(orderPath(`/api/v1/orders/${id}/status`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to update order"));
    return res.json();
}
export async function getInventory(sku) {
    const res = await authedFetch(inventoryPath(`/api/v1/inventory/${encodeURIComponent(sku)}`));
    if (!res.ok)
        throw new Error(await readError(res, "Stock item not found"));
    return res.json();
}
/** Inventory lookup by canonical ULID `skuId`. */
export async function getInventoryBySkuId(skuId) {
    const res = await authedFetch(inventoryPath(`/api/v1/inventory/by-sku-id/${encodeURIComponent(skuId)}`));
    if (!res.ok)
        throw new Error(await readError(res, "Stock item not found"));
    return res.json();
}
export async function setInventory(sku, quantity) {
    const res = await authedFetch(inventoryPath(`/api/v1/inventory/${encodeURIComponent(sku)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to update stock"));
    return res.json();
}
export async function adjustInventory(sku, delta) {
    const res = await authedFetch(inventoryPath(`/api/v1/inventory/${encodeURIComponent(sku)}/adjust`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to adjust stock"));
    return res.json();
}
async function inventoryQuantityForSku(sku) {
    try {
        const item = await getInventory(sku);
        return item.quantity;
    }
    catch {
        return null;
    }
}
/** Stock alerts from inventory service keyed by variant SKU. */
export async function getCatalogStockAlerts() {
    const products = await listAllProducts();
    const rows = [];
    await Promise.all(products.flatMap((product) => productVariants(product).map(async (variant) => {
        const quantity = await inventoryQuantityForSku(variant.sku);
        if (quantity == null)
            return;
        rows.push({
            parentId: product.id,
            parentName: product.name,
            sku: variant.sku,
            color: variant.color,
            size: variant.size,
            quantity,
            available: Math.max(0, quantity),
        });
    })));
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
];
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
];
export const ALL_PERMISSIONS = [
    ...PERMISSION_WILDCARDS,
    ...PERMISSION_CATALOG,
];
export function isManagerUser(user) {
    return user.account_type !== "customer";
}
export function isCustomerUser(user) {
    return user.account_type === "customer";
}
export function formatPermissions(permissions) {
    return permissions.length > 0 ? permissions.join(", ") : "—";
}
export async function listUsers() {
    const res = await authedFetch(authPath("/api/v1/auth/users"));
    if (!res.ok)
        throw new Error(await readError(res, "Failed to list users"));
    const data = (await res.json());
    return data.users ?? [];
}
export async function getUserById(userId) {
    const users = await listUsers();
    return users.find((user) => user.user_id === userId) ?? null;
}
export async function registerUser(email, password) {
    const res = await authedFetch(authPath("/api/v1/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to register user"));
    return res.json();
}
export async function setUserPermissions(userId, permissions, accountType) {
    const res = await authedFetch(authPath(`/api/v1/auth/users/${encodeURIComponent(userId)}/permissions`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountType ? { permissions, account_type: accountType } : { permissions }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to update permissions"));
    return res.json();
}
export async function setUserPassword(userId, password) {
    const res = await authedFetch(authPath(`/api/v1/auth/users/${encodeURIComponent(userId)}/password`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to update password"));
}
export async function setUserStatus(userId, isActive) {
    const res = await authedFetch(authPath(`/api/v1/auth/users/${encodeURIComponent(userId)}/status`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to update status"));
    return res.json();
}
export async function getDashboardStats() {
    const [products, orders] = await Promise.all([
        getProducts().catch(() => []),
        getOrders().catch(() => []),
    ]);
    return { productCount: products.length, orderCount: orders.length };
}
export async function getAnalytics() {
    const orders = await getOrders();
    if (orders.length === 0)
        return null;
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const within = (days) => (o) => now - new Date(o.created_at).getTime() <= days * day;
    const sumRevenue = (list) => list.reduce((sum, o) => sum + o.total_cents, 0);
    const last7 = orders.filter(within(7));
    const last30 = orders.filter(within(30));
    return {
        revenue7d: sumRevenue(last7),
        revenue30d: sumRevenue(last30),
        orders7d: last7.length,
        orders30d: last30.length,
    };
}
