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
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_GATEWAY_PORT ?? 8080);
const VALID_EMAIL = process.env.MOCK_ADMIN_EMAIL ?? "admin@dupli1.com";
const VALID_PASSWORD = process.env.MOCK_ADMIN_PASSWORD ?? "Dupli1Admin2026!";
const REFRESH_TOKEN = "mock-refresh-token";
const ACCESS_TOKEN = "mock-access-token";

const SERVICE_PREFIXES = ["/auth", "/product", "/inventory", "/order", "/notification"];

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
    { sku: "BAG-BLK-M", quantity: 1, unit_price_krw: 250000 },
  ];
  const subtotal = items.reduce((sum, i) => sum + i.unit_price_krw * i.quantity, 0);
  return {
    id: `ord_${Math.random().toString(36).slice(2, 10)}`,
    customer_id: "cust-1",
    reservation_id: "res-1",
    items,
    status: "pending",
    subtotal_krw: subtotal,
    discount_krw: 0,
    total_krw: subtotal,
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
      makeOrder({ id, status, created_at: created, updated_at: created })
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

  // Orders.
  if (method === "GET" && path === "/api/v1/orders/events") {
    return handleOrderEvents(req, res);
  }
  if (method === "GET" && path === "/api/v1/orders") {
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
