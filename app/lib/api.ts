import { authedFetch } from "./auth";
import {
  inventoryPath,
  orderPath,
  productPath,
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
  imageUrls?: string[];
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

function hitStringArray(hit: ProductSearchHit, key: string): string[] | undefined {
  const value = hit[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((v): v is string => typeof v === "string");
  return strings.length > 0 ? strings : undefined;
}

export function mapProduct(
  hit: ProductSearchHit,
  category?: string,
  index = 0
): Product {
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

export function mapSearchHit(
  hit: ProductSearchHit,
  category: string,
  index = 0
): Product {
  return mapProduct(hit, category, index);
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

const BAG_FILTERS = ["brand", "color", "material"] as const;
const SUPPORTED_CATEGORIES = ["bags"] as const;

export async function getCategories(): Promise<string[]> {
  return [...SUPPORTED_CATEGORIES];
}

export async function getFilters(
  category: string
): Promise<{ category: string; filters: string[] }> {
  if (
    !SUPPORTED_CATEGORIES.includes(
      category.toLowerCase() as (typeof SUPPORTED_CATEGORIES)[number]
    )
  ) {
    return { category, filters: [] };
  }

  return { category, filters: [...BAG_FILTERS] };
}

export async function searchProducts(
  category: string,
  filters: Record<string, string> = {}
): Promise<Product[]> {
  if (category.toLowerCase() !== "bags") return [];

  const params = new URLSearchParams();
  for (const key of BAG_FILTERS) {
    const value = filters[key]?.trim();
    if (value) params.set(key, value);
  }

  const query = params.toString();
  const res = await fetch(
    productPath(`/api/v1/products/bags${query ? `?${query}` : ""}`),
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to search products"));
  const data = (await res.json()) as ProductSearchResponse;
  const results = Array.isArray(data.results) ? data.results : [];
  return results.map((hit, i) => mapSearchHit(hit, category, i));
}

export async function getProducts(category = "bags"): Promise<Product[]> {
  return searchProducts(category);
}

export async function getProduct(
  category: string,
  id: string
): Promise<Product | null> {
  const products = await searchProducts(category);
  return products.find((p) => p.id === id || p.sku === id) ?? null;
}

export async function getManageProduct(id: string): Promise<Product> {
  const res = await authedFetch(
    productPath(`/api/v1/products/${encodeURIComponent(id)}/manage`)
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
    productPath(`/api/v1/products/${encodeURIComponent(id)}/image`),
    { method: "PUT", body: form }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to upload image"));
  const hit = (await res.json()) as ProductSearchHit;
  return mapProduct(hit);
}

export interface CreateBagProductInput {
  title: string;
  sku: string;
  brand: string;
  color: string;
  material: string;
}

export async function createBagProduct(
  input: CreateBagProductInput
): Promise<Product> {
  const res = await authedFetch(productPath("/api/v1/products/bags"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to create product"));
  const hit = (await res.json()) as ProductSearchHit;
  return mapSearchHit(hit, "bags");
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
  // The order service requires customer_id; there is no list-all endpoint yet.
  if (!customerId) return [];

  const res = await authedFetch(
    orderPath(`/api/v1/orders?customer_id=${encodeURIComponent(customerId)}`)
  );
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
  const res = await fetch("/auth/session/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
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
