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
        sku,
        productId: hitString(hit, "product_id") ?? hitString(hit, "productId"),
        color: hitString(hit, "color") ?? "",
        size: hitString(hit, "size") ?? "",
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
    const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
    }).format(value);
    return product.priceFrom != null ? `From ${formatted}` : formatted;
}
/** Best-effort thumbnail for list cards (parent default or first variant image). */
export function productPreviewImage(product) {
    if (product.defaultImageUrl)
        return product.defaultImageUrl;
    if (product.imageUrls && product.imageUrls.length > 0) {
        return product.imageUrls[0];
    }
    for (const variant of productVariants(product)) {
        if (variant.imageUrls.length > 0)
            return variant.imageUrls[0];
    }
    return null;
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
export function mapSearchHit(hit, category, index = 0) {
    return mapProduct(hit, category, index);
}
async function readError(res, fallback) {
    try {
        const body = (await res.json());
        if (body.error) {
            if (res.status === 403 &&
                body.error.includes("insufficient role")) {
                return `${body.error}. Requires product_manager, admin, or owner.`;
            }
            return body.error;
        }
        return fallback;
    }
    catch {
        return fallback;
    }
}
const BAG_FILTERS = ["brand", "color", "material"];
/** List all products (all statuses). Requires auth. */
export async function listAllProducts() {
    const res = await authedFetch(productPath("/api/v1/products"));
    if (!res.ok)
        throw new Error(await readError(res, "Failed to list products"));
    const hits = (await res.json());
    if (!Array.isArray(hits))
        return [];
    return hits.map((hit, i) => mapProduct(hit, undefined, i));
}
export async function searchProducts(category, filters = {}) {
    if (category.toLowerCase() !== "bags")
        return [];
    const params = new URLSearchParams();
    for (const key of BAG_FILTERS) {
        const value = filters[key]?.trim();
        if (value)
            params.set(key, value);
    }
    const query = params.toString();
    const res = await fetch(productPath(`/api/v1/products/bags${query ? `?${query}` : ""}`), { headers: { Accept: "application/json" } });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to search products"));
    const data = (await res.json());
    const results = Array.isArray(data.results) ? data.results : [];
    return results.map((hit, i) => mapSearchHit(hit, category, i));
}
export async function getProducts() {
    return listAllProducts();
}
export async function getProduct(category, id) {
    const products = await searchProducts(category);
    return products.find((p) => p.id === id || p.sku === id) ?? null;
}
export async function getManageProduct(id) {
    try {
        return await getProductDetail(id);
    }
    catch {
        const res = await authedFetch(productPath(`/api/v1/products/${encodeURIComponent(id)}/manage`));
        if (!res.ok)
            throw new Error(await readError(res, "Product not found"));
        const hit = (await res.json());
        return mapProduct(hit);
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
    const res = await authedFetch(productPath(`/api/v1/products/${encodeURIComponent(id)}/image`), { method: "PUT", body: form });
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
            id: input.id,
            brand: input.brand,
            material: input.material,
            category: input.category ?? "bags",
            description: input.description,
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
            color: input.color,
            price: input.price,
            size: input.size ?? "",
            sku: input.sku,
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
    const products = await listAllProducts().catch(() => []);
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
export const MANAGER_ROLES = [
    "owner",
    "admin",
    "user_manager",
    "customer_registrar",
    "product_manager",
];
export const ALL_ROLES = [...MANAGER_ROLES, "customer"];
export function isManagerUser(user) {
    return user.roles.some((role) => MANAGER_ROLES.includes(role));
}
export function isCustomerUser(user) {
    return user.roles.includes("customer");
}
export function formatRoles(roles) {
    return roles.length > 0 ? roles.join(", ") : "—";
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
export async function setUserRoles(userId, roles) {
    const res = await authedFetch(authPath(`/api/v1/auth/users/${encodeURIComponent(userId)}/roles`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to update roles"));
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
    const orders = await getOrders().catch(() => []);
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
