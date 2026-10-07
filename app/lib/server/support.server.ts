/**
 * Server-only support (consultation inbox) API helpers.
 *
 * Called from loaders/actions so the browser never talks to `/support/…`
 * directly, exactly as the Telegram tab does. A shopper's transcript is
 * customer data: it is fetched with the operator's own access token and
 * rendered server-side, never exposed as a browser-callable endpoint.
 */
import { getLocaleFromRequest, translate, type MessageKey } from "~/lib/i18n";
import { redirect } from "react-router";
import { accessTokenFromSession } from "./auth-session";

const DEFAULT_GATEWAY_URL = "http://localhost:8080";
const INQUIRIES_PATH = "/api/v1/support/inquiries";

/** A product card as it was when sent (support's `ProductRef`). */
export type ProductRef = {
  product_id: string;
  sku_id: string;
  sku?: string;
  name: string;
  color?: string;
  price_won: number;
  image_url?: string;
};

/** An order card as it was when sent (support's `OrderRef`). */
export type OrderRef = {
  order_id: string;
  status: string;
  total_won: number;
  first_item_name?: string;
  item_count: number;
  created_at?: string;
};

export type SupportChannel = "telegram" | "web";

export type SupportMessage = {
  id: string;
  direction: "inbound" | "outbound";
  author?: string;
  /** `system` lines (after-hours note, closed) are neither side's words. */
  kind?: "text" | "product_ref" | "order_ref" | "system";
  body: string;
  ref_id?: string;
  ref?: ProductRef | OrderRef;
  /** Web replies: whether the unread-reply email went out. */
  notice_status?: "pending" | "sent" | "failed" | "skipped";
  /** Outbound only: "sent", or "failed" when the shopper never received it. */
  delivery?: string;
  delivery_error?: string;
  created_at: string;
};

export type SupportInquiry = {
  id: string;
  /** Missing on responses from before web chat, which were all Telegram. */
  channel?: SupportChannel;
  topic: string;
  status: "open" | "assigned" | "answered" | "closed";
  assigned_to?: string;
  language?: string;
  username?: string;
  entry_context?: string;
  last_message?: string;
  opened_at: string;
  closed_at?: string;
  /** Web only: the signed-in shopper. Never their phone or addresses. */
  customer_id?: string;
  customer_email?: string;
  /** Web only: how far the shopper has read — the console's 읽음. */
  customer_last_read_at?: string;
  product_id?: string;
  sku_id?: string;
  order_id?: string;
  transcript?: SupportMessage[];
};

/** Channel filter on top of the three lists; "all" sends none. */
export type SupportChannelFilter = "all" | SupportChannel;

/** The inbox's three lists. */
export type SupportQueue = "waiting" | "mine" | "closed";

function gatewayBase(): string {
  return (
    process.env.DUPLI1_GATEWAY_URL ??
    process.env.DUPLI1_API_BASE_URL ??
    DEFAULT_GATEWAY_URL
  ).replace(/\/$/, "");
}

export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function supportFetch(
  request: Request,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = `${gatewayBase()}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const tokenResult = await accessTokenFromSession(request);
  if (tokenResult instanceof Response) throw redirect("/login");
  headers.set("Authorization", `Bearer ${tokenResult.accessToken}`);

  const res = await fetch(url, { ...init, headers });
  if (res.status !== 401) return res;

  // Token may have been revoked mid-request — force refresh once, as the BFF does.
  const refreshed = await accessTokenFromSession(request, { forceRefresh: true });
  if (refreshed instanceof Response) throw redirect("/login");
  headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
  return fetch(url, { ...init, headers });
}

function queueQuery(queue: SupportQueue): string {
  switch (queue) {
    case "mine":
      // `me` resolves to the caller server-side, so the console never needs to
      // know its own user id.
      return "?assigned_to=me";
    case "closed":
      return "?status=closed";
    default:
      return "?queue=waiting";
  }
}

export async function loadInquiries(
  request: Request,
  queue: SupportQueue,
  channel: SupportChannelFilter = "all"
): Promise<SupportInquiry[]> {
  const query = queueQuery(queue) + (channel === "all" ? "" : `&channel=${channel}`);
  const res = await supportFetch(request, `${INQUIRIES_PATH}${query}`);
  if (!res.ok) {
    throw new Error(await readError(res, tr(request, "support.loadInquiriesFailed")));
  }
  const body = (await res.json()) as { inquiries?: SupportInquiry[] | null };
  return Array.isArray(body.inquiries) ? body.inquiries : [];
}

export async function loadInquiry(
  request: Request,
  id: string
): Promise<SupportInquiry> {
  const res = await supportFetch(request, `${INQUIRIES_PATH}/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error(await readError(res, tr(request, "support.loadInquiryFailed")));
  }
  const body = (await res.json()) as { inquiry: SupportInquiry };
  return body.inquiry;
}

export async function claimInquiry(
  request: Request,
  id: string
): Promise<SupportInquiry> {
  const res = await supportFetch(
    request,
    `${INQUIRIES_PATH}/${encodeURIComponent(id)}/assign`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(await readError(res, tr(request, "support.claimFailed")));
  const body = (await res.json()) as { inquiry: SupportInquiry };
  return body.inquiry;
}

export type ReplyResult = {
  inquiry: SupportInquiry;
  /** False when the shopper never received it — shown as 미전송. */
  delivered: boolean;
};

/** A card sent with a reply — web consultations only. */
export type ReplyAttachment = { sku_id?: string; order_id?: string };

export async function replyToInquiry(
  request: Request,
  id: string,
  body: string,
  attach: ReplyAttachment = {}
): Promise<ReplyResult> {
  const res = await supportFetch(
    request,
    `${INQUIRIES_PATH}/${encodeURIComponent(id)}/reply`,
    { method: "POST", body: JSON.stringify({ body, ...attach }) }
  );
  if (!res.ok) throw new Error(await readError(res, tr(request, "support.replyFailed")));
  const payload = (await res.json()) as ReplyResult;
  return payload;
}

export async function closeInquiry(
  request: Request,
  id: string
): Promise<SupportInquiry> {
  const res = await supportFetch(
    request,
    `${INQUIRIES_PATH}/${encodeURIComponent(id)}/close`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(await readError(res, tr(request, "support.closeFailed")));
  const body = (await res.json()) as { inquiry: SupportInquiry };
  return body.inquiry;
}

// ── Context panel ────────────────────────────────────────────────────────────
//
// What staff see beside a web consultation: who is asking, what they asked
// about, and what they have bought. Read with the operator's own token —
// orders need `order.read.all`, which the support_agent bundle carries. The
// shopper's phone and saved addresses are deliberately never fetched.

/** Statuses that count as money actually taken (excludes pending, canceled). */
const SPENT_STATUSES = new Set([
  "paid",
  "confirmed",
  "in_transit",
  "delivered",
  "fulfilled",
  "disputed",
]);

export type ContextOrder = {
  id: string;
  status: string;
  total_won: number;
  created_at: string;
  first_item_name?: string;
  item_count: number;
  sku_ids: string[];
};

export type ContextProduct = {
  product_id: string;
  sku_id: string;
  sku?: string;
  name: string;
  color?: string;
  price_won: number;
  image_url?: string;
  status?: string;
  available_qty?: number;
};

export type PurchaseHistory = {
  /** Orders that were paid for, whatever happened after. */
  order_count: number;
  total_spent_won: number;
  /** Most recent first, every status, at most 10. */
  recent: ContextOrder[];
};

export type SupportContext = {
  product: ContextProduct | null;
  order: ContextOrder | null;
  history: PurchaseHistory | null;
  /** The referenced product appears in an order the shopper paid for. */
  bought_before: boolean;
  /** Parts that could not be loaded (a 403 without order.read.all, say). */
  errors: string[];
};

type RawOrder = {
  id: string;
  status: string;
  total_won?: number;
  created_at: string;
  items?: { sku_id?: string; sku?: string; product_name?: string; quantity?: number }[];
};

function toContextOrder(order: RawOrder): ContextOrder {
  const items = order.items ?? [];
  return {
    id: order.id,
    status: order.status,
    total_won: order.total_won ?? 0,
    created_at: order.created_at,
    first_item_name: items[0]?.product_name || items[0]?.sku,
    item_count: items.reduce((sum, item) => sum + (item.quantity ?? 1), 0),
    sku_ids: items.map((item) => item.sku_id ?? "").filter(Boolean),
  };
}

/** Pure, for tests: totals and the recent list from a customer's orders. */
export function summarizeOrders(orders: RawOrder[]): PurchaseHistory {
  const sorted = [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at));
  let count = 0;
  let spent = 0;
  for (const order of sorted) {
    if (!SPENT_STATUSES.has(order.status)) continue;
    count += 1;
    spent += order.total_won ?? 0;
  }
  return {
    order_count: count,
    total_spent_won: spent,
    recent: sorted.slice(0, 10).map(toContextOrder),
  };
}

/** Pure, for tests: whether a paid order holds the SKU. */
export function boughtBefore(orders: RawOrder[], skuId: string | undefined): boolean {
  if (!skuId) return false;
  return orders.some(
    (order) =>
      SPENT_STATUSES.has(order.status) &&
      (order.items ?? []).some((item) => item.sku_id === skuId)
  );
}

async function loadCustomerOrders(request: Request, customerId: string): Promise<RawOrder[]> {
  const res = await supportFetch(
    request,
    `/api/v1/orders?customer_id=${encodeURIComponent(customerId)}`
  );
  if (!res.ok) throw new Error(await readError(res, tr(request, "support.loadHistoryFailed")));
  const body = (await res.json()) as { orders?: RawOrder[] | null };
  return Array.isArray(body.orders) ? body.orders : [];
}

async function loadOrder(request: Request, id: string): Promise<RawOrder> {
  const res = await supportFetch(request, `/api/v1/orders/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await readError(res, tr(request, "support.loadOrderFailed")));
  return (await res.json()) as RawOrder;
}

type RawVariant = {
  skuId: string;
  sku?: string;
  productId: string;
  productName?: string;
  color?: string;
  price?: number;
  status?: string;
  imageUrls?: string[];
  listingImageUrls?: string[];
  availableQty?: number;
};

async function loadVariant(request: Request, skuId: string): Promise<ContextProduct> {
  // The variant lookup, not GET /products/{id}: that one counts a PDP view.
  const res = await supportFetch(
    request,
    `/api/v1/products/variants/by-sku-id/${encodeURIComponent(skuId)}`
  );
  if (!res.ok) throw new Error(await readError(res, tr(request, "support.loadProductFailed")));
  const v = (await res.json()) as RawVariant;
  return {
    product_id: v.productId,
    sku_id: v.skuId,
    sku: v.sku,
    name: v.productName || v.sku || v.skuId,
    color: v.color,
    price_won: Math.round(v.price ?? 0),
    image_url: v.listingImageUrls?.[0] ?? v.imageUrls?.[0],
    status: v.status,
    available_qty: v.availableQty,
  };
}

/** A fallback error, in the operator's language. */
function tr(request: Request, key: MessageKey): string {
  return translate(getLocaleFromRequest(request), key);
}

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Loads the context panel for a web inquiry. Each part fails on its own, so
 * an unreachable product service still leaves the order history on screen.
 */
export async function loadSupportContext(
  request: Request,
  inquiry: SupportInquiry
): Promise<SupportContext | null> {
  if (inquiry.channel !== "web" || !inquiry.customer_id) return null;
  return loadShopperContext(request, {
    customerId: inquiry.customer_id,
    skuId: inquiry.sku_id,
    orderId: inquiry.order_id,
  });
}

/**
 * The context panel for any signed-in shopper: the product (by SKU) and order
 * they asked about, and their purchase history. Shared by web consultations
 * and product questions.
 */
export async function loadShopperContext(
  request: Request,
  ref: { customerId: string; skuId?: string; orderId?: string }
): Promise<SupportContext> {
  const errors: string[] = [];

  const [productResult, orderResult, ordersResult] = await Promise.allSettled([
    ref.skuId ? loadVariant(request, ref.skuId) : Promise.resolve(null),
    ref.orderId ? loadOrder(request, ref.orderId) : Promise.resolve(null),
    loadCustomerOrders(request, ref.customerId),
  ]);

  let product: ContextProduct | null = null;
  if (productResult.status === "fulfilled") product = productResult.value;
  else errors.push(message(productResult.reason, tr(request, "support.loadProductFailed")));

  let order: ContextOrder | null = null;
  if (orderResult.status === "fulfilled") {
    order = orderResult.value ? toContextOrder(orderResult.value) : null;
  } else errors.push(message(orderResult.reason, tr(request, "support.loadOrderFailed")));

  let history: PurchaseHistory | null = null;
  let bought = false;
  if (ordersResult.status === "fulfilled") {
    history = summarizeOrders(ordersResult.value);
    bought = boughtBefore(ordersResult.value, ref.skuId);
  } else errors.push(message(ordersResult.reason, tr(request, "support.loadHistoryFailed")));

  return { product, order, history, bought_before: bought, errors };
}

/**
 * Opens the inbox's live stream upstream with the operator's token, for the
 * `/support/events` resource route. Frames carry ids only; the page reloads
 * through its loader on each one, so no transcript crosses this path.
 */
export async function openInboxStream(request: Request): Promise<Response> {
  const tokenResult = await accessTokenFromSession(request);
  if (tokenResult instanceof Response) return tokenResult;
  return fetch(`${gatewayBase()}${INQUIRIES_PATH}/events`, {
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${tokenResult.accessToken}`,
    },
    signal: request.signal,
  });
}
