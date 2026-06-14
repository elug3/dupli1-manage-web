import { authedFetch } from "./auth";

export type ProductStatus = "active" | "draft" | "archived";
export type OrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  description: string;
  brand?: string;
  color?: string;
  material?: string;
  status: ProductStatus;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  customerEmail: string;
  items: OrderItem[];
  itemCount: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
}

export interface DashboardStats {
  activeProducts: number;
}

export interface AnalyticsSummary {
  revenue7d: number;
  revenue30d: number;
  revenue90d: number;
  orders7d: number;
  orders30d: number;
  topCategories: { category: string; revenue: number; orders: number }[];
  topProducts: { id: string; name: string; sold: number; revenue: number }[];
}

// ── Products ─────────────────────────────────────────────────────────────────
// Routes through Vite proxy: /api → localhost:8081 (product service)

export async function getProducts(): Promise<Product[]> {
  const res = await authedFetch("/api/products");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to fetch products");
  }
  return res.json() as Promise<Product[]>;
}

export async function createProduct(
  data: Omit<Product, "id" | "createdAt">
): Promise<Product> {
  const res = await authedFetch("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to create product");
  }
  return res.json() as Promise<Product>;
}

export async function updateProduct(
  id: string,
  data: Partial<Omit<Product, "id" | "createdAt">>
): Promise<Product> {
  const res = await authedFetch(`/api/products/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to update product");
  }
  return res.json() as Promise<Product>;
}

export async function deleteProduct(id: string): Promise<void> {
  const res = await authedFetch(`/api/products/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete product");
}

// ── Users ────────────────────────────────────────────────────────────────────
// Routes through Vite proxy: /api/v1 → localhost:8080 (auth service)

export type UserRole = "owner" | "admin" | "user";

export interface AdminUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export async function getUsers(): Promise<AdminUser[]> {
  const res = await authedFetch("/api/v1/users");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to fetch users");
  }
  return res.json() as Promise<AdminUser[]>;
}

export async function updateUserRole(id: string, role: UserRole): Promise<AdminUser> {
  const res = await authedFetch(`/api/v1/users/${id}/role`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to update role");
  }
  return res.json() as Promise<AdminUser>;
}

export async function createUser(data: {
  email: string;
  password: string;
  role: UserRole;
}): Promise<AdminUser> {
  const res = await authedFetch("/api/v1/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to create user");
  }
  return res.json() as Promise<AdminUser>;
}

export async function deleteUser(id: string): Promise<void> {
  const res = await authedFetch(`/api/v1/users/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete user");
}

// ── Orders ───────────────────────────────────────────────────────────────────
// Not yet implemented in the backend — returns empty list.

export async function getOrders(): Promise<Order[]> {
  return [];
}

export async function updateOrderStatus(
  _id: string,
  _status: OrderStatus
): Promise<void> {
  // not yet implemented
}

// ── Analytics / Dashboard ────────────────────────────────────────────────────
// Not yet implemented in the backend.
// getDashboardStats derives active product count from the products API.

export async function getDashboardStats(): Promise<DashboardStats> {
  const products = await getProducts();
  return {
    activeProducts: products.filter((p) => p.status === "active").length,
  };
}

export async function getAnalytics(): Promise<AnalyticsSummary | null> {
  return null;
}
