import { authedFetch } from "./auth";
import { inventoryPath, orderPath, productPath, authPath, } from "./gateway";
// ── Product catalog (read-only search) ───────────────────────────────────────
export const PRODUCT_CATEGORIES = [
    "consultations",
    "shoes",
    "outerwear",
    "bottoms",
    "bags",
    "clocks",
];
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
export function mapSearchHit(hit, category, index = 0) {
    return {
        id: hitId(hit, index),
        name: hitName(hit),
        category,
        price: hitNumber(hit, "price") ?? hitNumber(hit, "unit_price_cents"),
        stock: hitNumber(hit, "stock") ?? hitNumber(hit, "quantity"),
        description: hitString(hit, "description"),
        brand: hitString(hit, "brand"),
        color: hitString(hit, "color"),
        material: hitString(hit, "material"),
        sku: hitString(hit, "sku"),
        status: hitString(hit, "status"),
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
export async function getCategories() {
    const res = await authedFetch(productPath("/api/categories"));
    if (!res.ok)
        throw new Error(await readError(res, "Failed to fetch categories"));
    const data = (await res.json());
    return data.categories;
}
export async function getFilters(category) {
    const res = await authedFetch(productPath(`/api/filters?category=${encodeURIComponent(category)}`));
    if (!res.ok)
        throw new Error(await readError(res, "Failed to fetch filters"));
    return res.json();
}
export async function searchProducts(category, filters = {}) {
    const params = new URLSearchParams({ category, ...filters });
    const res = await authedFetch(productPath(`/api/products/search?${params.toString()}`));
    if (!res.ok)
        throw new Error(await readError(res, "Failed to search products"));
    const data = (await res.json());
    return (data.results ?? []).map((hit, i) => mapSearchHit(hit, category, i));
}
export async function getProducts(category = "shoes") {
    return searchProducts(category);
}
export async function getProduct(category, id) {
    const products = await searchProducts(category);
    return products.find((p) => p.id === id || p.sku === id) ?? null;
}
export async function getOrders(customerId) {
    const query = customerId
        ? `?customer_id=${encodeURIComponent(customerId)}`
        : "";
    const res = await authedFetch(orderPath(`/api/v1/orders${query}`));
    if (!res.ok)
        throw new Error(await readError(res, "Failed to fetch orders"));
    const data = (await res.json());
    return data.orders ?? [];
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
// ── Auth (register) ──────────────────────────────────────────────────────────
export async function registerUser(email, password) {
    const res = await fetch(authPath("/api/v1/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
