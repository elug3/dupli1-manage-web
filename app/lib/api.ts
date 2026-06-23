import { authedFetch } from "./auth";
import {
  inventoryPath,
  orderPath,
  productPath,
  authPath,
} from "./gateway";

// ── Product catalog (read-only search) ───────────────────────────────────────

export const PRODUCT_CATEGORIES = [
  "consultations",
  "shoes",
  "outerwear",
  "bottoms",
  "bags",
  "clocks",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

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
  color?: string;
  material?: string;
  sku?: string;
  status?: string;
  raw: ProductSearchHit;
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

export function mapSearchHit(
  hit: ProductSearchHit,
  category: string,
  index = 0
): Product {
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

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getCategories(): Promise<string[]> {
  const res = await authedFetch(productPath("/api/categories"));
  if (!res.ok) throw new Error(await readError(res, "Failed to fetch categories"));
  const data = (await res.json()) as { categories: string[] };
  return data.categories;
}

export async function getFilters(
  category: string
): Promise<{ category: string; filters: string[] }> {
  const res = await authedFetch(
    productPath(`/api/filters?category=${encodeURIComponent(category)}`)
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to fetch filters"));
  return res.json() as Promise<{ category: string; filters: string[] }>;
}

export async function searchProducts(
  category: string,
  filters: Record<string, string> = {}
): Promise<Product[]> {
  const params = new URLSearchParams({ category, ...filters });
  const res = await authedFetch(
    productPath(`/api/products/search?${params.toString()}`)
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to search products"));
  const data = (await res.json()) as ProductSearchResponse;
  return (data.results ?? []).map((hit, i) => mapSearchHit(hit, category, i));
}

export async function getProducts(category = "shoes"): Promise<Product[]> {
  return searchProducts(category);
}

export async function getProduct(
  category: string,
  id: string
): Promise<Product | null> {
  const products = await searchProducts(category);
  return products.find((p) => p.id === id || p.sku === id) ?? null;
}

// ── Orders ───────────────────────────────────────────────────────────────────

export type OrderStatus = "pending" | "confirmed" | "canceled" | "fulfilled";

export interface OrderItem {
  sku: string;
  quantity: number;
  unit_price_cents: number;
}

export interface Order {
  id: string;
  customer_id: string;
  reservation_id?: string;
  items: OrderItem[];
  status: OrderStatus;
  total_cents: number;
  created_at: string;
  updated_at: string;
}

export interface OrdersResponse {
  total: number;
  orders: Order[];
}

export async function getOrders(customerId?: string): Promise<Order[]> {
  const query = customerId
    ? `?customer_id=${encodeURIComponent(customerId)}`
    : "";
  const res = await authedFetch(orderPath(`/api/v1/orders${query}`));
  if (!res.ok) throw new Error(await readError(res, "Failed to fetch orders"));
  const data = (await res.json()) as OrdersResponse;
  return data.orders ?? [];
}

export async function getOrder(id: string): Promise<Order> {
  const res = await authedFetch(orderPath(`/api/v1/orders/${id}`));
  if (!res.ok) throw new Error(await readError(res, "Order not found"));
  return res.json() as Promise<Order>;
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus
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

// ── Auth (register) ──────────────────────────────────────────────────────────

export async function registerUser(
  email: string,
  password: string
): Promise<{ user_id: string }> {
  const res = await fetch(authPath("/api/v1/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to register user"));
  return res.json() as Promise<{ user_id: string }>;
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
  const orders = await getOrders().catch(() => [] as Order[]);
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
