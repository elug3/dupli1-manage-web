#!/usr/bin/env node
/**
 * Minimal Schick auth gateway mock for local login testing.
 * Listens on :8080 and serves /auth/api/v1/auth/{login,refresh,logout}.
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_GATEWAY_PORT ?? 8080);
const VALID_EMAIL = process.env.MOCK_ADMIN_EMAIL ?? "admin@schick.com";
const VALID_PASSWORD = process.env.MOCK_ADMIN_PASSWORD ?? "SchickAdmin2026!";
const REFRESH_TOKEN = "mock-refresh-token";
const ACCESS_TOKEN = "mock-access-token";

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

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  if (method === "POST" && url === "/auth/api/v1/auth/login") {
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

  if (method === "POST" && url === "/auth/api/v1/auth/refresh") {
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

  if (method === "POST" && url === "/auth/api/v1/auth/logout") {
    return res.writeHead(204).end();
  }

  if (method === "GET" && url === "/health") {
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: `Not found: ${method} ${url}` });
});

server.listen(PORT, () => {
  console.log(`Mock gateway listening on http://localhost:${PORT}`);
});
