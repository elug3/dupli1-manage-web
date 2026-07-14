# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For concise, machine-focused guidance for AI coding agents, see [AGENTS.md](AGENTS.md).

## Purpose

`dupli1-manage-web` is the admin/management dashboard for the Dupli1 e-commerce platform. It is the counterpart to `dupli1-web` (customer-facing storefront) and connects to the same Go microservices via an nginx gateway.

## Expected Stack

Mirror `dupli1-web` exactly:

- React 19, React Router 7, TypeScript, Vite
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- SSR enabled (`ssr: true` in `react-router.config.ts`)

## Commands

```bash
npm install          # install dependencies
npm run dev          # dev server at http://localhost:5173
npm run build        # production build
npm run start        # serve production build
npm run typecheck    # react-router typegen + tsc
```

## Backend (API Gateway)

All services run on port `8080` internally. The nginx gateway strips its location prefix before proxying:

| Gateway prefix | Service |
|---|---|
| `/auth/` | dupli1-auth |
| `/product/` | dupli1-product |
| `/inventory/` | dupli1-inventory |
| `/order/` | dupli1-order |

Client paths use the gateway prefix, e.g. `GET /product/api/v1/products`. The Vite dev proxy rewrites prefixes the same way nginx does.

Set `DUPLI1_GATEWAY_URL` (default `http://localhost:8080`) for SSR server-side backend calls.

### Auth (`/auth`)

- `POST /auth/api/v1/auth/register` — create account (Bearer service token or admin role)
- `POST /auth/api/v1/auth/login` — returns `{ refresh_token }`
- `POST /auth/api/v1/auth/refresh` — `{ refresh_token }` → `{ token }` (access token)
- `POST /auth/api/v1/auth/logout` — `204`
- `GET /auth/api/v1/auth/me` — current user profile
- `GET /auth/api/v1/auth/users` — list users (admin)

### Product (`/product`)

- `GET /product/api/v1/products/bags` — public bag search (`brand`, `color`, `material` query params)
- `GET /product/api/v1/products` — list all products (auth)
- `POST /product/api/v1/products` — create product (auth)
- `GET /product/api/v1/products/{id}/manage` — product detail for admin (auth)
- `PUT /product/api/v1/products/{id}` — update product (auth)
- `DELETE /product/api/v1/products/{id}` — delete product (auth)
- `POST /product/api/v1/products/{id}/images` — upload image to default variant (auth, multipart field `image`)
- `POST /product/api/v1/products/{id}/variants/{sku}/images` — upload image for a variant (auth, multipart field `image`)
- `GET|POST /product/api/v1/coupons`, `PUT|DELETE /product/api/v1/coupons/{code}` — coupon CRUD (auth)

### Order (`/order`)

- `GET /order/api/v1/orders?customer_id=` — list orders for a customer (auth; admin aggregates across users)
- `GET /order/api/v1/orders/{id}`, `PUT /order/api/v1/orders/{id}/status`

### Inventory (`/inventory`)

`/inventory/api/v1/inventory/{sku}`, adjust, reservations.

## Auth (browser)

Server-side session storage keeps both refresh and access tokens off the browser entirely:

- No token of any kind is stored client-side (not in `localStorage`, not in a readable cookie).
- Refresh token and a short-lived cached access token live in the SSR server's in-memory session cache, keyed by `session_id`.
- `dupli1_sid` httpOnly cookie carries the session id; the browser never sees either token.
- `POST /auth/session/login`, `/auth/session/logout`, `GET /auth/session/me` proxy auth to the gateway and manage the session cookie. `/auth/session/refresh` still exists for callers that want an access token directly.
- `authedFetch` (in `app/lib/auth.ts`) sends all `/auth`, `/product`, `/inventory`, `/order` API calls to `/auth/session/gateway/*` with `credentials: "include"` and no `Authorization` header. The `auth.session.gateway.tsx` route (`handleSessionGatewayProxy`) resolves the session cookie server-side, exchanges/reuses a cached access token, attaches `Authorization: Bearer <token>`, and forwards the request to the real gateway.
- Users carry `permissions: string[]` and `account_type: "customer" | "admin" | "service"` (see `PERMISSION_CATALOG` / `AccountType` in `app/lib/api.ts`) — the legacy `roles` claim was removed from the backend.

## Architecture

```
app/
  root.tsx          Document shell, top/side nav, error boundary
  routes.ts         Route registration (file-based via @react-router/dev/routes)
  app.css           Global styles and Tailwind import
  routes/           One file per route
  lib/              Shared utilities (api.ts, auth.ts, gateway.ts, …)
  lib/server/       SSR-only session store and auth handlers
```

Route modules use React Router 7 conventions: `loader` for data fetching, `action` for mutations, `default` export for the component.

## Production access

The admin dashboard is **not** exposed on the public internet. In production:

- `dupli1-manage-web` runs in **private subnets** with no public IP and no ALB attachment.
- Managers connect via the **WireGuard VPN** (`dupli1-internal-vpn`), then open:

  **http://manage.dupli1.local**

- API calls from manage-web reach backends via `DUPLI1_GATEWAY_URL=http://proxy.dupli1.local` (internal nginx gateway).
- The customer storefront (`dupli1-web`) remains public via `dupli1-prod-alb`.

## Sibling Projects

| Repo | Purpose |
|------|---------|
| `../dupli1` | Go backend — API contracts and domain model |
| `dupli1-web` | Customer storefront — copy patterns for routing, auth, API helpers |
