#!/usr/bin/env node
/**
 * Dupli1 gateway mock for local browser tests.
 *
 * Serves the upstream paths the SSR session and the admin pages actually call
 * (`/api/v1/auth/*`, `/api/v1/orders*`), including the live order feed as
 * Server-Sent Events. Browser-side prefixes (`/auth`, `/order`, …) are stripped
 * if present, so requests arriving straight from the Vite dev proxy work too.
 *
 * `/__control/*` drives the fixture from a test: emit an order event, broadcast
 * a reset, add an order the stream does not announce, inspect connections.
 *
 * Support's inbox is here too (`/api/v1/support/*`): a web consultation with
 * a product card and a Telegram one, plus the inbox stream.
 * `POST /__control/support-message` has the web shopper write again.
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_GATEWAY_PORT ?? 8080);
const VALID_EMAIL = process.env.MOCK_ADMIN_EMAIL ?? "admin@dupli1.com";
const VALID_PASSWORD = process.env.MOCK_ADMIN_PASSWORD ?? "Dupli1Admin2026!";
const REFRESH_TOKEN = "mock-refresh-token";
// Override with a real signed JWT to put a real service behind the same BFF
// session (e.g. order's event stream, which verifies the token).
const ACCESS_TOKEN = process.env.MOCK_ACCESS_TOKEN || "mock-access-token";

const SERVICE_PREFIXES = ["/auth", "/product", "/inventory", "/order", "/notification"];

const users = new Map();
const apiKeys = new Map();

function makeUser(email, accountType, permissions, extra = {}) {
  const user = {
    user_id: `usr_${users.size + 1}`,
    email,
    account_type: accountType,
    permissions,
    is_active: true,
    locked_at: null,
    failed_login_attempts: 0,
    has_password: accountType !== "service",
    ...extra,
  };
  users.set(user.user_id, user);
  return user;
}

makeUser(VALID_EMAIL, "manager", ["*"], { user_id: "usr_mock_admin" });
{
  const order = makeUser("order@internal.dupli1", "service", [
    "order.ship",
    "promotion.redeem",
    "payment.cancel",
  ]);
  apiKeys.set("key_env_order", {
    id: "key_env_order",
    user_id: order.user_id,
    name: "bootstrap",
    prefix: "dk_test_Ab3x",
    permissions: [],
    source: "env",
    created_at: "2026-09-27T00:00:00Z",
    created_by: "",
    expires_at: null,
    last_used_at: "2026-09-27T12:00:00Z",
    revoked_at: null,
  });
}

const products = new Map();
const stock = new Map();

function seedProduct(id, name, skus) {
  products.set(id, {
    id,
    name,
    category: "bags",
    status: "active",
    price: 250000,
    brandCode: "DUP",
    styleCode: "ECO01",
    variants: skus.map(([sku, skuId, color]) => ({
      sku,
      skuId,
      productId: id,
      color,
      colorCode: sku.split("_")[2],
      sizeCode: "OS",
      status: "active",
      imageUrls: [],
    })),
  });
}

// A product whose black SKU is held by an open order and whose green SKU
// still has stock on hand; the natural SKU is empty and deletable.
seedProduct("prod_mock_eco", "Eco Bag", [
  ["DUP_ECO01_BLK_OS", "sku_eco_blk", "Black"],
  ["DUP_ECO01_GRN_OS", "sku_eco_grn", "Green"],
  ["DUP_ECO01_NAT_OS", "sku_eco_nat", "Natural"],
]);
stock.set("sku_eco_blk", { sku: "DUP_ECO01_BLK_OS", quantity: 4, reserved: 1, updated_at: "2026-09-27T00:00:00Z" });
stock.set("sku_eco_grn", { sku: "DUP_ECO01_GRN_OS", quantity: 3, reserved: 0, updated_at: "2026-09-27T00:00:00Z" });
stock.set("sku_eco_nat", { sku: "DUP_ECO01_NAT_OS", quantity: 0, reserved: 0, updated_at: "2026-09-27T00:00:00Z" });

/** Heartbeat cadence, matching the order service. */
const HEARTBEAT_MS = 20_000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Upstream sees `/api/v1/...`; tolerate a browser prefix that was not stripped. */
function normalizePath(pathname) {
  for (const prefix of SERVICE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return pathname.slice(prefix.length) || "/";
    }
  }
  return pathname;
}

// ── Order fixture ────────────────────────────────────────────────────────────

const orders = new Map();

function makeOrder(overrides = {}) {
  const now = new Date().toISOString();
  const items = overrides.items ?? [
    { sku: "BAG-BLK-M", quantity: 1, unit_price_won: 250000 },
  ];
  const subtotal = items.reduce((sum, i) => sum + i.unit_price_won * i.quantity, 0);
  return {
    id: `ord_${Math.random().toString(36).slice(2, 10)}`,
    customer_id: "cust-1",
    reservation_id: "res-1",
    items,
    status: "pending",
    subtotal_won: subtotal,
    discount_won: 0,
    shipping_fee_won: 0,
    total_won: subtotal,
    recipient_name: "Seed Recipient",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function seed() {
  orders.clear();
  for (const [id, status, minutesAgo] of [
    ["ord_seed_paid", "paid", 30],
    ["ord_seed_pending", "pending", 10],
  ]) {
    const created = new Date(Date.now() - minutesAgo * 60_000).toISOString();
    orders.set(
      id,
      makeOrder({
        id,
        status,
        created_at: created,
        updated_at: created,
        // Paid orders auto-confirm 2h after payment (paid on creation here).
        ...(status === "paid"
          ? {
              paid_at: created,
              confirmation_due_at: new Date(
                Date.now() + (120 - minutesAgo) * 60_000
              ).toISOString(),
            }
          : {}),
      })
    );
  }
}
seed();

function orderList() {
  return [...orders.values()].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
}

// ── SSE fan-out ──────────────────────────────────────────────────────────────

/** Connected streams, mirroring the order service's hub. */
const clients = new Set();

/** Last `Last-Event-ID` a client presented, so a test can prove resume works. */
let lastEventIdSeen = null;

function writeFrame(res, { id, event, data }) {
  let frame = "";
  if (id) frame += `id: ${id}\n`;
  if (event) frame += `event: ${event}\n`;
  frame += `data: ${JSON.stringify(data)}\n\n`;
  res.write(frame);
}

function broadcast(frame) {
  for (const res of clients) writeFrame(res, frame);
  return clients.size;
}

function handleOrderEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");

  const lastEventId = req.headers["last-event-id"];
  if (lastEventId) {
    lastEventIdSeen = lastEventId;
    // The fixture keeps no history, which is exactly the restarted-task case:
    // the honest answer is "reload from REST".
    writeFrame(res, { event: "reset", data: { reason: "gap" } });
  }

  clients.add(res);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

// The last 12 KST Monday weeks or calendar months, current one last, as
// [start, end] YYYY-MM-DD pairs — the shape the real report endpoints return.
function reportPeriods(granularity) {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const ymd = (d) => d.toISOString().slice(0, 10);
  const out = [];
  if (granularity === "month") {
    for (let i = 11; i >= 0; i--) {
      const start = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
      out.push([ymd(start), ymd(end)]);
    }
    return out;
  }
  const today = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  for (let i = 11; i >= 0; i--) {
    const start = new Date(monday);
    start.setUTCDate(monday.getUTCDate() - 7 * i);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    out.push([ymd(start), ymd(end)]);
  }
  return out;
}

// ── Support fixture ──────────────────────────────────────────────────────────

const WEB_SHOPPER = "cust-web-1";

/** The web shopper's orders, kept apart so the order list tests stay as they are. */
const shopperOrders = new Map();
for (const [id, status, daysAgo, name, skuId, total] of [
  ["ord_web_1", "fulfilled", 40, "Eco Bag", "sku_eco_blk", 250000],
  ["ord_web_2", "in_transit", 3, "Eco Bag", "sku_eco_grn", 250000],
  ["ord_web_3", "canceled", 10, "Mini Pouch", "sku_other", 90000],
]) {
  const created = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  shopperOrders.set(
    id,
    makeOrder({
      id,
      customer_id: WEB_SHOPPER,
      status,
      created_at: created,
      updated_at: created,
      items: [{ sku_id: skuId, sku: skuId, product_name: name, quantity: 1, unit_price_won: total }],
      total_won: total,
      subtotal_won: total,
    })
  );
}

const inquiries = new Map();
let supportSeq = 0;
const supportId = (p) => `${p}_${++supportSeq}`;

function supportMessage(direction, body, extra = {}) {
  return {
    id: supportId("msg"),
    direction,
    kind: "text",
    body,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

function productRef(skuId) {
  for (const product of products.values()) {
    const v = product.variants.find((x) => x.skuId === skuId);
    if (v) {
      return {
        product_id: product.id, sku_id: v.skuId, sku: v.sku, name: product.name,
        color: v.color, price_won: product.price,
      };
    }
  }
  return null;
}

function orderRef(order) {
  return {
    order_id: order.id, status: order.status, total_won: order.total_won,
    first_item_name: order.items[0]?.product_name, item_count: order.items.length,
    created_at: order.created_at,
  };
}

function seedSupport() {
  inquiries.clear();
  const opened = new Date(Date.now() - 5 * 60_000).toISOString();
  const ref = productRef("sku_eco_blk");
  inquiries.set("inq_web_1", {
    id: "inq_web_1", channel: "web", topic: "prd", status: "open", opened_at: opened,
    customer_id: WEB_SHOPPER, customer_email: "shopper@example.com",
    product_id: ref.product_id, sku_id: ref.sku_id,
    transcript: [
      supportMessage("inbound", `상품: ${ref.name} (${ref.color})`, { kind: "product_ref", ref_id: ref.sku_id, ref, created_at: opened }),
      supportMessage("inbound", "블랙 재입고 언제 되나요?", { created_at: opened }),
    ],
  });
  inquiries.set("inq_tg_1", {
    id: "inq_tg_1", channel: "telegram", topic: "ret", status: "open", username: "tg_shopper",
    opened_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    transcript: [supportMessage("inbound", "반품하고 싶어요")],
  });
}
seedSupport();

function inquiryView(inquiry, withTranscript) {
  const { transcript, ...rest } = inquiry;
  const last = [...transcript].reverse().find((m) => m.direction === "inbound");
  return {
    ...rest,
    last_message: last?.body,
    ...(withTranscript ? { transcript } : {}),
  };
}

const supportStreams = new Set();
function supportBroadcast(event, data) {
  for (const res of supportStreams) writeFrame(res, { event, data });
  return supportStreams.size;
}

function handleSupportEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  writeFrame(res, { event: "ready", data: {} });
  supportStreams.add(res);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  req.on("close", () => {
    clearInterval(heartbeat);
    supportStreams.delete(res);
  });
}

async function handleSupport(req, res, method, path, url) {
  if (method === "GET" && path === "/api/v1/support/inquiries/events") {
    handleSupportEvents(req, res);
    return true;
  }
  if (method === "GET" && path === "/api/v1/support/inquiries") {
    const queue = url.searchParams.get("queue");
    const status = url.searchParams.get("status");
    const assigned = url.searchParams.get("assigned_to");
    const channel = url.searchParams.get("channel");
    const list = [...inquiries.values()].filter((i) => {
      if (channel && (i.channel ?? "telegram") !== channel) return false;
      if (status) return i.status === status;
      if (assigned) return i.assigned_to === "usr_mock_admin" && i.status !== "closed";
      if (queue === "waiting") return !i.assigned_to && i.status !== "closed";
      return true;
    });
    send(res, 200, { inquiries: list.map((i) => inquiryView(i, false)) });
    return true;
  }
  const m = path.match(/^\/api\/v1\/support\/inquiries\/([^/]+)(?:\/(assign|reply|close))?$/);
  if (!m) return false;
  const inquiry = inquiries.get(decodeURIComponent(m[1]));
  if (!inquiry) {
    send(res, 404, { error: "inquiry not found" });
    return true;
  }
  const action = m[2];
  if (!action && method === "GET") {
    send(res, 200, { inquiry: inquiryView(inquiry, true) });
    return true;
  }
  if (method !== "POST") return false;
  if (action === "assign" || action === "reply") {
    inquiry.assigned_to = "usr_mock_admin";
    if (inquiry.status === "open") inquiry.status = "assigned";
  }
  if (action === "reply") {
    const body = await readBody(req).catch(() => ({}));
    const web = inquiry.channel === "web";
    if (!web && (body.sku_id || body.order_id)) {
      send(res, 422, { error: "reference cards can only be sent in web consultations", code: "reference_on_telegram" });
      return true;
    }
    const extra = { author: "usr_mock_admin", delivery: "sent", ...(web ? { notice_status: "pending" } : {}) };
    if (body.sku_id) {
      const ref = productRef(body.sku_id);
      if (!ref) {
        send(res, 422, { error: "referenced product or order not found", code: "invalid_reference" });
        return true;
      }
      inquiry.transcript.push(supportMessage("outbound", `상품: ${ref.name}`, { ...extra, kind: "product_ref", ref_id: ref.sku_id, ref }));
    }
    if (body.order_id) {
      const order = shopperOrders.get(body.order_id) ?? orders.get(body.order_id);
      if (!order) {
        send(res, 422, { error: "referenced product or order not found", code: "invalid_reference" });
        return true;
      }
      inquiry.transcript.push(supportMessage("outbound", `주문: ${order.id}`, { ...extra, kind: "order_ref", ref_id: order.id, ref: orderRef(order) }));
    }
    if (body.body?.trim()) inquiry.transcript.push(supportMessage("outbound", body.body.trim(), extra));
    inquiry.status = "answered";
  }
  if (action === "close") {
    inquiry.status = "closed";
    inquiry.closed_at = new Date().toISOString();
  }
  supportBroadcast(action === "reply" ? "message" : "inquiry", { type: action === "reply" ? "message" : "inquiry", inquiry_id: inquiry.id, channel: inquiry.channel });
  send(res, 200, { inquiry: inquiryView(inquiry, true), ...(action === "reply" ? { delivered: true } : {}) });
  return true;
}

// ── Routes ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = normalizePath(url.pathname);
  const { method } = req;

  // Test control surface.
  if (path === "/__control/state" && method === "GET") {
    return send(res, 200, {
      streams: clients.size,
      orders: orders.size,
      lastEventIdSeen,
    });
  }
  if (path === "/__control/drop" && method === "POST") {
    // Ends every open stream without an error, as a task restart or a scaling
    // event would. The browser should reconnect on its own.
    const dropped = clients.size;
    for (const stream of [...clients]) stream.end();
    clients.clear();
    return send(res, 200, { dropped });
  }
  if (path === "/__control/order" && method === "POST") {
    const body = await readBody(req).catch(() => ({}));
    const order = makeOrder({ ...(body.order ?? {}) });
    orders.set(order.id, order);
    const delivered = broadcast({
      id: String(Date.now() * 1e6),
      event: "order",
      data: { type: body.type ?? "order.created", order },
    });
    return send(res, 200, { order, delivered });
  }
  if (path === "/__control/silent-order" && method === "POST") {
    // Added to the list but never announced — proves a reset really refetches.
    const body = await readBody(req).catch(() => ({}));
    const order = makeOrder({ ...(body.order ?? {}) });
    orders.set(order.id, order);
    return send(res, 200, { order });
  }
  if (path === "/__control/reset" && method === "POST") {
    return send(res, 200, {
      delivered: broadcast({ event: "reset", data: { reason: "gap" } }),
    });
  }
  if (path === "/__control/support-seed" && method === "POST") {
    seedSupport();
    return send(res, 200, { inquiries: inquiries.size });
  }
  if (path === "/__control/support-message" && method === "POST") {
    // The web shopper writes again; announced on the inbox stream with ids only.
    const body = await readBody(req).catch(() => ({}));
    const inquiry = inquiries.get(body.inquiry_id ?? "inq_web_1");
    if (!inquiry) return send(res, 404, { error: "no inquiry" });
    const message = supportMessage("inbound", body.body ?? "아직 답변이 없나요?");
    inquiry.transcript.push(message);
    if (body.read) inquiry.customer_last_read_at = new Date().toISOString();
    return send(res, 200, {
      delivered: supportBroadcast("message", { type: "message", inquiry_id: inquiry.id, message_id: message.id, channel: inquiry.channel }),
    });
  }
  if (path === "/__control/stock" && method === "POST") {
    // Set a SKU's stock row: { skuId, quantity, reserved }.
    const body = await readBody(req).catch(() => ({}));
    const item = stock.get(body.skuId);
    if (!item) return send(res, 404, { error: "no stock row" });
    Object.assign(item, {
      quantity: body.quantity ?? item.quantity,
      reserved: body.reserved ?? item.reserved,
    });
    return send(res, 200, item);
  }
  if (path === "/__control/seed" && method === "POST") {
    seed();
    lastEventIdSeen = null;
    return send(res, 200, { orders: orders.size });
  }

  // Auth.
  if (method === "POST" && path === "/api/v1/auth/login") {
    try {
      const body = await readBody(req);
      if (body.email === VALID_EMAIL && body.password === VALID_PASSWORD) {
        return send(res, 200, { refresh_token: REFRESH_TOKEN });
      }
      return send(res, 401, { error: "Invalid credentials" });
    } catch {
      return send(res, 400, { error: "Invalid request body" });
    }
  }
  if (method === "POST" && path === "/api/v1/auth/refresh") {
    try {
      const body = await readBody(req);
      if (body.refresh_token === REFRESH_TOKEN) {
        return send(res, 200, { token: ACCESS_TOKEN });
      }
      return send(res, 401, { error: "Invalid refresh token" });
    } catch {
      return send(res, 400, { error: "Invalid request body" });
    }
  }
  if (method === "POST" && path === "/api/v1/auth/logout") {
    return res.writeHead(204).end();
  }
  if (method === "GET" && path === "/api/v1/auth/me") {
    return send(res, 200, {
      user_id: "usr_mock_admin",
      email: VALID_EMAIL,
      account_type: "manager",
      permissions: [
        "order.read.all",
        "order.ship",
        "order.status.update",
        "product.read",
      ],
    });
  }

  // Users and service-account API keys. Service accounts are created without
  // a password and authenticate with keys, as auth enforces.
  if (method === "GET" && path === "/api/v1/auth/users") {
    return send(res, 200, { users: [...users.values()] });
  }
  if (method === "POST" && path === "/api/v1/auth/register") {
    const body = await readBody(req).catch(() => ({}));
    const accountType = body.account_type || "customer";
    if (accountType === "service" && body.password) {
      return send(res, 422, { error: "register: service accounts do not use passwords; use api keys" });
    }
    if (accountType !== "service" && (body.password ?? "").length < 8) {
      return send(res, 400, { error: "register: parse request: password is required (at least 8 characters)" });
    }
    const user = makeUser(body.email, accountType, []);
    return send(res, 201, { user_id: user.user_id });
  }
  let m = path.match(/^\/api\/v1\/auth\/users\/([^/]+)\/permissions$/);
  if (m && method === "PATCH") {
    const user = users.get(decodeURIComponent(m[1]));
    if (!user) return send(res, 404, { error: "user not found" });
    const body = await readBody(req).catch(() => ({}));
    if (body.account_type === "service") user.has_password = false;
    if (body.account_type) user.account_type = body.account_type;
    user.permissions = body.permissions ?? [];
    return send(res, 200, user);
  }
  m = path.match(/^\/api\/v1\/auth\/users\/([^/]+)\/api-keys$/);
  if (m) {
    const user = users.get(decodeURIComponent(m[1]));
    if (!user) return send(res, 404, { error: "user not found" });
    if (user.account_type !== "service") {
      return send(res, 400, { error: "invalid_account_type" });
    }
    if (method === "GET") {
      return send(res, 200, {
        api_keys: [...apiKeys.values()].filter((k) => k.user_id === user.user_id),
      });
    }
    if (method === "POST") {
      const body = await readBody(req).catch(() => ({}));
      if (!body.name) return send(res, 400, { error: "name is required" });
      const plaintext = `dk_test_${Math.random().toString(36).slice(2).padEnd(43, "x")}`;
      const key = {
        id: `key_${apiKeys.size + 1}`,
        user_id: user.user_id,
        name: body.name,
        prefix: plaintext.slice(0, 12),
        permissions: body.permissions ?? [],
        source: "api",
        created_at: new Date().toISOString(),
        created_by: "usr_mock_admin",
        expires_at: body.expires_in_days
          ? new Date(Date.now() + body.expires_in_days * 86_400_000).toISOString()
          : null,
        last_used_at: null,
        revoked_at: null,
      };
      apiKeys.set(key.id, key);
      return send(res, 201, { ...key, api_key: plaintext });
    }
  }
  m = path.match(/^\/api\/v1\/auth\/api-keys\/([^/]+)$/);
  if (m && method === "DELETE") {
    const key = apiKeys.get(decodeURIComponent(m[1]));
    if (!key) return send(res, 404, { error: "api key not found" });
    if (key.source === "env") return send(res, 409, { error: "env_managed_key" });
    key.revoked_at ??= new Date().toISOString();
    return res.writeHead(204).end();
  }

  // Products and stock, with product's delete rules: a SKU goes only with
  // an empty stock row, and a product not while any SKU has stock reserved.
  m = path.match(/^\/api\/v1\/products\/([^/]+)$/);
  if (m && products.has(decodeURIComponent(m[1]))) {
    const product = products.get(decodeURIComponent(m[1]));
    if (method === "GET") return send(res, 200, product);
    if (method === "DELETE") {
      const held = product.variants.find((v) => stock.get(v.skuId)?.reserved > 0);
      if (held) {
        return send(res, 409, { error: `cannot delete: stock of ${held.sku} reserved for open orders` });
      }
      for (const v of product.variants) stock.delete(v.skuId);
      products.delete(product.id);
      return res.writeHead(204).end();
    }
  }
  m = path.match(/^\/api\/v1\/products\/([^/]+)\/variants\/([^/]+)$/);
  if (m && method === "DELETE") {
    const product = products.get(decodeURIComponent(m[1]));
    const sku = decodeURIComponent(m[2]);
    const variant = product?.variants.find((v) => v.sku === sku);
    if (!variant) return send(res, 404, { error: "variant not found" });
    const item = stock.get(variant.skuId);
    if (item && (item.quantity > 0 || item.reserved > 0)) {
      return send(res, 409, { error: `cannot delete variant ${sku}: it still has stock on hand or reserved` });
    }
    stock.delete(variant.skuId);
    product.variants = product.variants.filter((v) => v.sku !== sku);
    return res.writeHead(204).end();
  }
  m = path.match(/^\/api\/v1\/inventory\/by-sku-id\/([^/]+)$/);
  if (m && method === "GET") {
    const item = stock.get(decodeURIComponent(m[1]));
    return item ? send(res, 200, item) : send(res, 404, { error: "not found" });
  }

  if (path.startsWith("/api/v1/support/") && (await handleSupport(req, res, method, path, url))) {
    return;
  }
  m = path.match(/^\/api\/v1\/products\/variants\/by-sku-id\/([^/]+)$/);
  if (m && method === "GET") {
    const skuId = decodeURIComponent(m[1]);
    for (const product of products.values()) {
      const v = product.variants.find((x) => x.skuId === skuId);
      if (v) {
        const item = stock.get(skuId);
        return send(res, 200, {
          ...v,
          productName: product.name,
          price: product.price,
          availableQty: item ? Math.max(0, item.quantity - item.reserved) : 0,
        });
      }
    }
    return send(res, 404, { error: "variant not found" });
  }

  // Orders.
  if (method === "GET" && path === "/api/v1/orders/events") {
    return handleOrderEvents(req, res);
  }
  m = path.match(/^\/api\/v1\/orders\/([^/]+)\/confirm$/);
  if (m && method === "POST") {
    // Like the real order service: changes the order and does not announce it
    // on the stream, so the console must pick up its own action by itself.
    const order = orders.get(decodeURIComponent(m[1]));
    if (!order) return send(res, 404, { error: "order not found" });
    if (order.status !== "paid") return send(res, 409, { error: "order is not paid" });
    Object.assign(order, {
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return send(res, 200, order);
  }
  m = path.match(/^\/api\/v1\/orders\/([^/]+)$/);
  if (m && method === "GET" && orders.has(decodeURIComponent(m[1]))) {
    return send(res, 200, orders.get(decodeURIComponent(m[1])));
  }
  if (m && method === "GET" && shopperOrders.has(decodeURIComponent(m[1]))) {
    return send(res, 200, shopperOrders.get(decodeURIComponent(m[1])));
  }
  if (method === "GET" && path === "/api/v1/orders/reports/sales") {
    const granularity = url.searchParams.get("granularity") ?? "week";
    const periods = reportPeriods(granularity).map(([start, end], i) => {
      const orders = 3 + ((i * 7) % 11);
      const gross = orders * 182000 + i * 9000;
      const refunds = i % 4 === 2 ? 1 : 0;
      const refunded = refunds * 245000;
      return {
        period_start: start,
        period_end: end,
        orders,
        gross_won: gross,
        discount_won: orders * 8000,
        shipping_fee_won: orders * 3000,
        // Every mock order is paid by card: 10% on top, already in gross.
        card_surcharge_won: Math.floor(gross / 11),
        refunds,
        refunded_won: refunded,
        net_won: gross - refunded,
        average_order_won: Math.floor(gross / orders),
      };
    });
    const sum = (k) => periods.reduce((n, p) => n + p[k], 0);
    const totals = {
      period_start: periods[0].period_start,
      period_end: periods.at(-1).period_end,
      orders: sum("orders"),
      gross_won: sum("gross_won"),
      discount_won: sum("discount_won"),
      shipping_fee_won: sum("shipping_fee_won"),
      card_surcharge_won: sum("card_surcharge_won"),
      refunds: sum("refunds"),
      refunded_won: sum("refunded_won"),
      net_won: sum("net_won"),
      average_order_won: Math.floor(sum("gross_won") / sum("orders")),
    };
    return send(res, 200, {
      granularity,
      timezone: "Asia/Seoul",
      from: totals.period_start,
      to: totals.period_end,
      periods,
      totals,
    });
  }
  if (method === "GET" && path === "/api/v1/auth/reports/registrations") {
    const granularity = url.searchParams.get("granularity") ?? "week";
    const periods = reportPeriods(granularity).map(([start, end], i) => ({
      period_start: start,
      period_end: end,
      new_customers: 2 + ((i * 5) % 9),
    }));
    return send(res, 200, {
      granularity,
      timezone: "Asia/Seoul",
      from: periods[0].period_start,
      to: periods.at(-1).period_end,
      periods,
      total_new_customers: periods.reduce((n, p) => n + p.new_customers, 0),
      undated_customers: 37,
    });
  }
  if (method === "GET" && path === "/api/v1/products/reports/visitors") {
    const granularity = url.searchParams.get("granularity") ?? "week";
    const periods = reportPeriods(granularity).map(([start, end], i) => {
      const unique = 180 + ((i * 37) % 120);
      return {
        period_start: start,
        period_end: end,
        unique_visitors: unique,
        visitor_days: Math.floor(unique * 1.4),
      };
    });
    const unique = periods.reduce((n, p) => n + p.unique_visitors, 0);
    return send(res, 200, {
      granularity,
      timezone: "Asia/Seoul",
      from: periods[0].period_start,
      to: periods.at(-1).period_end,
      periods,
      total_unique_visitors: Math.floor(unique * 0.7),
      today: {
        date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()),
        unique_visitors: 42,
      },
    });
  }
  if (method === "GET" && path === "/api/v1/orders") {
    const customer = url.searchParams.get("customer_id");
    if (customer === WEB_SHOPPER) {
      const list = [...shopperOrders.values()];
      return send(res, 200, { total: list.length, orders: list });
    }
    const list = orderList();
    return send(res, 200, { total: list.length, orders: list });
  }

  if (method === "GET" && (path === "/health" || path === "/gateway/health")) {
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: `Not found: ${method} ${path}` });
});

server.listen(PORT, () => {
  console.log(`Mock gateway listening on http://localhost:${PORT}`);
});
