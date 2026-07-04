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
  sku: string;
  productId?: string;
  color: string;
  size: string;
  price: number;
  status: string;
  imageUrls: string[];
  inStock?: boolean;
  raw: ProductSearchHit;
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
    sku,
    productId: hitString(hit, "product_id") ?? hitString(hit, "productId"),
    color: hitString(hit, "color") ?? "",
    size: hitString(hit, "size") ?? "",
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
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
  return product.priceFrom != null ? `From ${formatted}` : formatted;
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
    if (body.error) {
      if (
        res.status === 403 &&
        body.error.includes("insufficient role")
      ) {
        return `${body.error}. Requires product_manager, admin, or owner.`;
      }
      return body.error;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

const BAG_FILTERS = ["brand", "color", "material"] as const;

/** List all products (all statuses). Requires auth. */
export async function listAllProducts(): Promise<Product[]> {
  const res = await authedFetch(productPath("/api/v1/products"));
  if (!res.ok) throw new Error(await readError(res, "Failed to list products"));
  const hits = (await res.json()) as ProductSearchHit[];
  if (!Array.isArray(hits)) return [];
  return hits.map((hit, i) => mapProduct(hit, undefined, i));
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

export async function getProducts(): Promise<Product[]> {
  return listAllProducts();
}

export async function getProduct(
  category: string,
  id: string
): Promise<Product | null> {
  const products = await searchProducts(category);
  return products.find((p) => p.id === id || p.sku === id) ?? null;
}

export async function getManageProduct(id: string): Promise<Product> {
  try {
    return await getProductDetail(id);
  } catch {
    const res = await authedFetch(
      productPath(`/api/v1/products/${encodeURIComponent(id)}/manage`)
    );
    if (!res.ok) throw new Error(await readError(res, "Product not found"));
    const hit = (await res.json()) as ProductSearchHit;
    return mapProduct(hit);
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
    productPath(`/api/v1/products/${encodeURIComponent(id)}/image`),
    { method: "PUT", body: form }
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
  id: string;
  brand: string;
  material: string;
  category?: string;
  description?: string;
}

export async function createProductParent(
  input: CreateProductParentInput
): Promise<Product> {
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
  if (!res.ok) throw new Error(await readError(res, "Failed to create product"));
  const hit = (await res.json()) as ProductSearchHit;
  return mapProduct(hit, input.category ?? "bags");
}

export interface CreateVariantInput {
  color: string;
  price: number;
  size?: string;
  sku?: string;
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
        color: input.color,
        price: input.price,
        size: input.size ?? "",
        sku: input.sku,
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

export type OrderStatus = "pending" | "confirmed" | "canceled" | "fulfilled";

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
  const products = await listAllProducts().catch(() => [] as Product[]);
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

export const MANAGER_ROLES = [
  "owner",
  "admin",
  "user_manager",
  "customer_registrar",
  "product_manager",
] as const;

export const ALL_ROLES = [...MANAGER_ROLES, "customer"] as const;

export type AuthRole = (typeof ALL_ROLES)[number];

export interface AuthUser {
  user_id: string;
  email: string;
  roles: string[];
  is_active: boolean;
  locked_at: string | null;
  failed_login_attempts: number;
}

export function isManagerUser(user: AuthUser): boolean {
  return user.roles.some((role) =>
    (MANAGER_ROLES as readonly string[]).includes(role)
  );
}

export function isCustomerUser(user: AuthUser): boolean {
  return user.roles.includes("customer");
}

export function formatRoles(roles: string[]): string {
  return roles.length > 0 ? roles.join(", ") : "—";
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

export async function setUserRoles(
  userId: string,
  roles: string[]
): Promise<AuthUser> {
  const res = await authedFetch(
    authPath(`/api/v1/auth/users/${encodeURIComponent(userId)}/roles`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, "Failed to update roles"));
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
