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

Upstream nginx (dupli1) serves versioned paths under `/api/v1/...` with **no** service prefix stripping. Manage-web still uses browser-side prefixes (`/auth`, `/product`, `/inventory`, `/order`) so page routes like `/products` are not swallowed; the Vite proxy and SSR gateway routes strip those prefixes before forwarding to `DUPLI1_GATEWAY_URL` (default `http://localhost:8080`).

| Browser prefix | Upstream path example | Service |
|---|---|---|
| `/auth/` | `/api/v1/auth/...` | dupli1-auth |
| `/product/` | `/api/v1/products`, `/api/v1/catalog`, `/api/v1/coupons`, … | dupli1-product |
| `/inventory/` | `/api/v1/inventory/...` | dupli1-product (inventory merged) |
| `/order/` | `/api/v1/orders`, `/api/v1/checkout`, … | dupli1-order |

Client example: `GET /product/api/v1/products` → gateway `GET /api/v1/products`.

### Product images

Local Docker embeds browser URLs as `{S3_PUBLIC_ENDPOINT}/product-images/{key}` (default `http://localhost:8080/product-images/…`); nginx proxies that path to MinIO. Manage-web rewrites those absolute URLs to same-origin `/product-images/…` and proxies via Vite (dev) or the `product-images/*` SSR route (prod) so the browser does not need to reach the gateway host directly.

**AWS production:** product `imageUrls` use CloudFront (`images.dupli1.com`); see backend [docs/product-images-browser-access.md](../dupli1/docs/product-images-browser-access.md). `productImageSrc` still rewrites legacy gateway/MinIO-style URLs for local dev.

### Currency

Admin UI is **KRW-only**. `formatCurrency` / `formatCents` (`app/lib/i18n`) always format as Korean Won; settings does not offer other currencies. Aligns with backend `domain.DefaultCurrency = "krw"`.

### Auth (`/auth`)

- `POST /auth/api/v1/auth/register` — create account (Bearer; `user.create`)
- `POST /auth/api/v1/auth/login` — returns `{ refresh_token }`
- `POST /auth/api/v1/auth/refresh` — `{ refresh_token }` → `{ token }` (access token)
- `POST /auth/api/v1/auth/logout` — `204`
- `GET /auth/api/v1/auth/me` — current user profile
- `GET /auth/api/v1/auth/users` — list users (admin)

### Product (`/product`)

- `GET /product/api/v1/products` — list parents (`product.read` widens drafts/cost)
- `POST /product/api/v1/products` — create parent (ULID `id`; requires existing `brandCode` + `styleCode`)
- `GET /product/api/v1/products/{id}` — parent PDP with `variants[]`, `price`, `officialPrice`, `attributes`, merchandising fields (`brandCode`, `styleCode`, `subCategory`, `style`, `target`, `material`, …)
- `PUT /product/api/v1/products/{id}` — update parent (including price, officialPrice, attributes, catalog master codes)
- `DELETE /product/api/v1/products/{id}` — delete parent
- `POST /product/api/v1/products/{id}/variants` — create variant (requires existing `colorCode` + `sizeCode`)
- `PUT|DELETE /product/api/v1/products/{id}/variants/{sku}`
- `POST /product/api/v1/products/{id}/images` — upload to default variant
- `POST /product/api/v1/products/{id}/variants/{sku}/images`
- `GET|POST|PATCH|DELETE /product/api/v1/catalog/brands|colors|sizes|editions` (+ styles under brands) — master data (`product.master.read|write`)
- `GET|POST /product/api/v1/coupons`, `PUT|DELETE /product/api/v1/coupons/{code}`

SKU identity: each variant has immutable `skuId` (ULID) and human `sku` composed from master codes. Parent `attributes` is a display-only string map — see backend [docs/product-attributes.md](../dupli1/docs/product-attributes.md). Parent pricing: [docs/product-price-on-parent.md](../dupli1/docs/product-price-on-parent.md). Optional variant `dimensions` (`widthMm` / `heightMm` / `depthMm` in mm) is edited on SKU detail and variant create/edit — see [docs/product-sku-dimensions.md](../dupli1/docs/product-sku-dimensions.md).

### Order (`/order`)

- `GET /order/api/v1/orders?customer_id=` — list orders (admin aggregates across users)
- `GET /order/api/v1/orders/{id}`
- `POST /order/api/v1/orders/{id}/ship` — `paid` → `in_transit` (`order.ship`)
- `PUT /order/api/v1/orders/{id}/status` — `canceled` or `fulfilled` only (`order.status.update`)

Statuses: `pending` → `paid` → `in_transit` → `fulfilled` (or `canceled` from pending/paid).

Orders from checkout complete include an immutable fulfillment snapshot (`recipient_name`, `recipient_phone`, `shipping_address`) shown in the order expand panel.

### Inventory (`/inventory`)

`/inventory/api/v1/inventory/{sku}` and `/by-sku-id/{skuId}`, adjust, reservations (served by product).

### Notification (`/notification`)

Telegram ops bot manager API (served by `dupli1-notification`):

- `GET /notification/api/v1/notification/telegram/subscriptions` — list (`notification.telegram.read`)
- `POST …/subscriptions`, `…/{id}/accept|reject`, `DELETE …/{id}` — manage (`notification.telegram.manage`)

UI: `/telegram`. **Production requires `AUTH_JWKS_URL` on the notification ECS task** — without it the API returns `503 auth not configured` and the tab fails to load. See [docs/ai-instruct-dupli1-notification-jwks.md](docs/ai-instruct-dupli1-notification-jwks.md).

## Auth (browser)

Server-side session storage keeps both refresh and access tokens off the browser entirely:

- No token of any kind is stored client-side (not in `localStorage`, not in a readable cookie).
- Refresh token and a short-lived cached access token live in the SSR server's in-memory session cache, keyed by `session_id`.
- `dupli1_sid` httpOnly cookie carries the session id; the browser never sees either token.
- `POST /auth/session/login`, `/auth/session/logout`, `GET /auth/session/me` proxy auth to the gateway and manage the session cookie. `/auth/session/refresh` always force-exchanges the refresh token (never returns a cached access token) — callers reach it after a 401, so the cached token is exactly what just failed.
- `authedFetch` (in `app/lib/auth.ts`) sends all `/auth`, `/product`, `/inventory`, `/order`, `/notification` API calls to `/auth/session/gateway/*` with `credentials: "include"` and no `Authorization` header. The `auth.session.gateway.tsx` route (`handleSessionGatewayProxy`) resolves the session cookie server-side, exchanges/reuses a cached access token, attaches `Authorization: Bearer <token>`, and forwards the request to the real gateway. **Auth is the source of truth for login:** a non-auth upstream 401 triggers one forced refresh + retry in the BFF; if auth refresh fails the session is cleared (real logout). If refresh succeeds but the upstream still rejects, the BFF returns `502` `upstream_unauthorized` so the browser does not bounce to `/login`. Client-side, redirect to `/login` only when refresh fails or an **auth** service path still returns 401.
- Users carry `permissions: string[]` and `account_type: "customer" | "manager" | "service"` (see `PERMISSION_CATALOG` / `AccountType` in `app/lib/api.ts`) — includes `product.master.read|write`. The legacy `roles` claim was removed from the backend. Auth stores human operators as `manager`; manage-web still accepts legacy wire `admin` on read via `normalizeAccountType`.

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

Admin surfaces: products (parent + variants with inline **price**, **officialPrice**, **attributes** key-value editor, and catalog master fields on PDP), **SKU detail** (`/products/:id/SKU/:skuId`), **catalog masters** (`/catalog`), orders, coupons, users (**Customers / Managers / Services** tabs by `account_type`), **Telegram** (`/telegram` — ops alert subscriptions), settings (local UI; manager settings API still sketch on backend).

## Production access

Admin is published at **https://manage.dupli1.com** (ALB). The internal VPN host was retired for day-to-day admin access.

- API calls use `DUPLI1_GATEWAY_URL` (internal nginx / proxy hostname in ECS).
- The customer storefront (`dupli1-web`) remains public via the same ALB (`dupli1.com`).

## Sibling Projects

| Repo | Purpose |
|------|---------|
| `../dupli1` | Go backend — API contracts and domain model |
| `dupli1-web` | Customer storefront — copy patterns for routing, auth, API helpers |
