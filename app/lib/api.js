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
export function mapProduct(hit, category, index = 0) {
    return {
        id: hitId(hit, index),
        name: hitName(hit),
        category: category ?? hitString(hit, "category") ?? "bags",
        price: hitNumber(hit, "price") ?? hitNumber(hit, "unit_price_cents"),
        stock: hitNumber(hit, "stock") ?? hitNumber(hit, "quantity"),
        description: hitString(hit, "description"),
        brand: hitString(hit, "brand"),
        color: hitString(hit, "color"),
        material: hitString(hit, "material"),
        sku: hitString(hit, "sku") ?? hitString(hit, "id"),
        status: hitString(hit, "status"),
        imageUrls: hitStringArray(hit, "imageUrls"),
        raw: hit,
    };
}
export function mapSearchHit(hit, category, index = 0) {
    return mapProduct(hit, category, index);
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
    const res = await authedFetch(productPath(`/api/v1/products/${encodeURIComponent(id)}/manage`));
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
export async function listUsers() {
    const res = await authedFetch(authPath("/api/v1/auth/users"));
    if (!res.ok)
        throw new Error(await readError(res, "Failed to list users"));
    const data = (await res.json());
    return data.users ?? [];
}
export async function registerUser(email, password) {
    const res = await fetch("/auth/session/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok)
        throw new Error(await readError(res, "Failed to register user"));
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
