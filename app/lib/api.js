import { authedFetch } from "./auth";
// ── Products ─────────────────────────────────────────────────────────────────
// Routes through Vite proxy: /api → localhost:8081 (product service)
export async function getProducts() {
    const res = await authedFetch("/api/products");
    if (!res.ok) {
        const body = (await res.json().catch(() => ({})));
        throw new Error(body.error ?? "Failed to fetch products");
    }
    return res.json();
}
export async function createProduct(data) {
    const res = await authedFetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const body = (await res.json().catch(() => ({})));
        throw new Error(body.error ?? "Failed to create product");
    }
    return res.json();
}
export async function updateProduct(id, data) {
    const res = await authedFetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const body = (await res.json().catch(() => ({})));
        throw new Error(body.error ?? "Failed to update product");
    }
    return res.json();
}
export async function deleteProduct(id) {
    const res = await authedFetch(`/api/products/${id}`, { method: "DELETE" });
    if (!res.ok)
        throw new Error("Failed to delete product");
}
export async function getUsers() {
    const res = await authedFetch("/api/v1/users");
    if (!res.ok) {
        const body = (await res.json().catch(() => ({})));
        throw new Error(body.error ?? "Failed to fetch users");
    }
    return res.json();
}
export async function updateUserRole(id, role) {
    const res = await authedFetch(`/api/v1/users/${id}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
    });
    if (!res.ok) {
        const body = (await res.json().catch(() => ({})));
        throw new Error(body.error ?? "Failed to update role");
    }
    return res.json();
}
export async function createUser(data) {
    const res = await authedFetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const body = (await res.json().catch(() => ({})));
        throw new Error(body.error ?? "Failed to create user");
    }
    return res.json();
}
export async function deleteUser(id) {
    const res = await authedFetch(`/api/v1/users/${id}`, { method: "DELETE" });
    if (!res.ok)
        throw new Error("Failed to delete user");
}
// ── Orders ───────────────────────────────────────────────────────────────────
// Not yet implemented in the backend — returns empty list.
export async function getOrders() {
    return [];
}
export async function updateOrderStatus(_id, _status) {
    // not yet implemented
}
// ── Analytics / Dashboard ────────────────────────────────────────────────────
// Not yet implemented in the backend.
// getDashboardStats derives active product count from the products API.
export async function getDashboardStats() {
    const products = await getProducts();
    return {
        activeProducts: products.filter((p) => p.status === "active").length,
    };
}
export async function getAnalytics() {
    return null;
}
