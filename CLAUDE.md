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
npm run lint         # ESLint (flat config in eslint.config.js); CI fails on errors, not warnings
```

## Backend (API Gateway)

Upstream nginx (dupli1) serves versioned paths under `/api/v1/...` with **no** service prefix stripping. Manage-web still uses browser-side prefixes (`/auth`, `/product`, `/inventory`, `/order`) so page routes like `/products` are not swallowed; the Vite proxy and SSR gateway routes strip those prefixes before forwarding to `DUPLI1_GATEWAY_URL` (default `http://localhost:8080`).

| Browser prefix | Upstream path example | Service |
|---|---|---|
| `/auth/` | `/api/v1/auth/...` | dupli1-auth |
| `/product/` | `/api/v1/products`, `/api/v1/catalog`, `/api/v1/products/promotions`, … | dupli1-product |
| `/inventory/` | `/api/v1/inventory/...` | dupli1-product (inventory merged) |
| `/order/` | `/api/v1/orders`, `/api/v1/checkout`, … | dupli1-order |

Client example: `GET /product/api/v1/products` → gateway `GET /api/v1/products`.

### Product images

Local Docker embeds browser URLs as `{S3_PUBLIC_ENDPOINT}/product-images/{key}` (default `http://localhost:8080/product-images/…`); nginx proxies that path to MinIO. Manage-web rewrites those absolute URLs to same-origin `/product-images/…` and proxies via Vite (dev) or the `product-images/*` SSR route (prod) so the browser does not need to reach the gateway host directly.

**AWS production:** product `imageUrls` use CloudFront (`images.dupli1.com`); see backend [docs/product-images-browser-access.md](../dupli1/docs/product-images-browser-access.md). `productImageSrc` still rewrites legacy gateway/MinIO-style URLs for local dev.

### Currency

Admin UI is **KRW-only**. `formatCurrency` / `formatWon` (`app/lib/i18n`) always format as Korean Won; settings does not offer other currencies. Aligns with backend `domain.DefaultCurrency = "krw"`.

Money fields on the wire are **`*_won`** (`total_won`, `subtotal_won`, `discount_won`, `shipping_fee_won`, `unit_price_won`). `*_krw` and `*_cents` are dead names from earlier renames — the backend emits neither, so a fixture, mock gateway, or client written with one reads as `undefined` here and renders an empty total. `*_krw` was canonical only between 2026-09-09 and 09-14, so anything cut in that window still says it.

### Auth (`/auth`)

- `POST /auth/api/v1/auth/register` — create account (Bearer; `user.create`). `account_type: "service"` is sent **without** a password — service accounts have none (auth answers `422` if one is sent)
- `GET|POST /auth/api/v1/auth/users/{id}/api-keys`, `DELETE /auth/api/v1/auth/api-keys/{keyId}` — a service account's API keys (`user.apikey.read|manage`; owner-only in practice, since only the owner manages service accounts). The plaintext is in the create response only; `source: "env"` keys are seeded from auth's env and revoke with `409`. Design: backend [docs/auth-service-api-keys.md](../dupli1/docs/auth-service-api-keys.md)
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
- `DELETE /product/api/v1/products/{id}` — delete parent, every SKU and their stock rows; `409` while any SKU has stock reserved for an open order
- `POST /product/api/v1/products/{id}/variants` — create variant (requires existing `colorCode` + `sizeCode`)
- `PUT|DELETE /product/api/v1/products/{id}/variants/{sku}` — delete needs the SKU's stock row empty (`409` with stock on hand or reserved)

Both deletes go through `DeleteConfirmDialog` (`app/components/`): a caution, the concrete impact with live stock, and a "Please type `<id>` to confirm." field (the product `id`, or the SKU code). Delete stays disabled while the backend would refuse, and the only SKU of a product cannot be deleted from the console.
- `POST /product/api/v1/products/{id}/images` — upload to default variant
- `POST /product/api/v1/products/{id}/variants/{sku}/images`
- `GET|POST|PATCH|DELETE /product/api/v1/catalog/brands|colors|sizes|editions` (+ styles under brands) — master data (`product.master.read|write`)
- `POST /product/api/v1/products/promotions/by-code/{code}/issue` and `DELETE …/promotions/entitlements/{id}` — grant a `single_user` code to one account and withdraw it (`promotion.issue`). Issuing is idempotent per customer per code. There is **no** manager endpoint listing what an account holds, so `/promotions` offers revoke only on the entitlement it just issued
- `GET|POST /product/api/v1/products/promotions`, `PUT|DELETE /product/api/v1/products/promotions/by-code/{code}` — **promotional codes**, renamed from `coupon` on 2026-09-16 (backend [docs/product-promotion-rename.md](../dupli1/docs/product-promotion-rename.md)). The pre-rename `/api/v1/coupons…` paths and the `coupon.*` permissions stay accepted for one release; this repo calls only the canonical ones
- Sign-up campaigns are data, not config: a `single_user` code with `auto_issue: "user_registered"` is granted to every new customer at sign-up (backend dupli1 #317). `/promotions` exposes it as a checkbox beside `entitlement_ttl_days` for single-user codes and badges such rows; the form always sends `auto_issue` (`""` when off or global) so switching a campaign to global scope ends it instead of being refused
- **Customer tiers** (VIP, private tiers): a single-user code with `apply_mode: "auto"` (backend dupli1 #318). Members, the accounts it is issued to, get it on every order without entering it, stacked under one code. `/promotions` offers it as a checkbox for single-user codes, badges such rows, refuses a campaign cap on one, and always sends `apply_mode` (`"code"` when off or global). The order page splits `discount_won` into the code's share and `tier_discount_won`

SKU identity: each variant has immutable `skuId` (ULID) and human `sku` composed from master codes. Parent `attributes` is a display-only string map — see backend [docs/product-attributes.md](../dupli1/docs/product-attributes.md). Parent pricing: [docs/product-price-on-parent.md](../dupli1/docs/product-price-on-parent.md). Optional variant `dimensions` (`widthMm` / `heightMm` / `depthMm` in mm) is edited on SKU detail and variant create/edit — see [docs/product-sku-dimensions.md](../dupli1/docs/product-sku-dimensions.md).

### Order (`/order`)

- `GET /order/api/v1/orders?customer_id=` — list orders (admin aggregates across users)
- `GET /order/api/v1/orders/{id}`
- `POST /order/api/v1/orders/{id}/confirm` — `paid` → `confirmed` (`order.status.update`, 2-hour SLA)
- `POST /order/api/v1/orders/{id}/ship` — `confirmed` → `in_transit` (`order.ship`; commits stock)
- `POST /order/api/v1/orders/{id}/deliver` — `in_transit` → `delivered` (`order.ship`)
- `POST /order/api/v1/orders/{id}/cancel/approve` and `…/reject` — customer cancel request (`order.status.update`)
- `PUT /order/api/v1/orders/{id}/status` — `canceled` or `fulfilled` (`order.status.update`). Cancel refunds the captured payment first (including `in_transit` / `delivered`); a PG rejection leaves the order unchanged.
- `GET /order/api/v1/orders/events` — **live order feed (SSE)**, `order.read.all`. Served by order since 2026-09-27 (`order/pkg/livefeed`); the stream ends when its access token expires and `EventSource` reconnects with `Last-Event-ID` through the BFF's fresh token

`OrderStatus` in `api.ts` carries all eight statuses; `confirmed`, `delivered` and `disputed` were missing, so their badges fell back to the raw code in grey and `/orders` had no tab for them.

Statuses: `pending` → `paid` → `confirmed` → `in_transit` → `delivered` → `fulfilled` (or `disputed` / `canceled`). Customer cancel before confirm is immediate; from `confirmed` through `delivered` it is a manager-approved request (2-hour SLA). Full lifecycle: backend [docs/order-service.md](../dupli1/docs/order-service.md).

Orders from checkout complete include an immutable fulfillment snapshot (`recipient_name`, `recipient_phone`, `shipping_address`) shown in the order expand panel.

#### Live order feed

`OrderFeedProvider` (`app/lib/order-events.tsx`) wraps the header and the routed pages in `admin.tsx`, so **one** stream of `GET /order/api/v1/orders/events` serves the whole console: it survives navigation, and it raises the `order.created` / `order.paid` notification wherever the operator happens to be — not just on `/orders`. It mounts past the layout's `if (!user) return null`, so no stream opens before sign-in.

Pages join that feed with `useOrderFeed(listener, enabled)` and only keep their own view in step — `/orders` merges rows and renders the Live / Not live pill, the dashboard refreshes its tiles. They gate on `enabled` until their first list load lands, so a streamed snapshot cannot render as the only row there is. Notifying is the provider's job alone; a page must not toast, or the operator gets two.

Each `event: order` frame carries the full order snapshot, so no follow-up fetch is needed; an `event: reset` frame means reload via `getOrders()`. SSE rather than a WebSocket because the BFF proxies with `fetch` (no HTTP upgrade) and the browser `WebSocket` API cannot send `Authorization` — see backend [docs/order-live-events.md](../dupli1/docs/order-live-events.md).

**Header bell** (`OrderAttentionBell`, `app/lib/order-attention.ts`): the badge counts orders waiting on an operator — `paid` (confirm before the 2h auto-confirm), an open cancel request (approve/reject before the 2h auto-approve), `disputed` — red when any is overdue, and the panel lists them by deadline. The count is derived from orders, not unread pings, so it is right after a reload. It stays current via the stream when live; via `order-updates.ts`, an in-tab channel every order mutation helper in `api.ts` publishes to (the provider relays it like a streamed snapshot, so the console's own confirm/ship/cancel lands at once); and, while the stream is not live, a `listAllOrders()` re-read every 30s when the tab is visible. Hidden without `order.read.all`.

`npm run test:orders:browser` drives all of this in a real browser against `npm run mock:gateway`. To put the real order service behind the same session, start the mock with `MOCK_ACCESS_TOKEN=<a JWT order accepts>` and route `/api/v1/orders` to order.

### Support (`/api/v1/support`)

Customer consultation inbox, served by `dupli1-support` — the **customer** Telegram bot, a different bot from the ops one behind `/telegram`.

- `GET /api/v1/support/inquiries?queue=waiting|…&assigned_to=me&status=closed` — inbox lists (`support.read`)
- `GET /api/v1/support/inquiries/{id}` — one inquiry with its transcript (`support.read`)
- `POST …/{id}/assign|reply|close` — claim, answer, finish (`support.reply`)
- `GET|PUT /api/v1/support/answers` — the bot's canned copy (`support.manage`)

UI: `/support` loads and mutates via **SSR** `loader`/`action` (`app/lib/server/support.server.ts`), like `/telegram`. A shopper's transcript is customer data, so it is fetched with the operator's own token and rendered server-side — never exposed as a browser-callable endpoint. A reply the shopper never received comes back `delivered: false` and is shown as **미전송** rather than reported as sent.

### Inventory (`/inventory`)

`/inventory/api/v1/inventory/{sku}` and `/by-sku-id/{skuId}`, adjust, reservations (served by product).

### Notification (`/notification`)

Telegram ops bot manager API (served by `dupli1-notification`). Upstream paths:

- `GET /api/v1/notification/telegram/subscriptions` — list (`notification.telegram.read`)
- `POST …/subscriptions`, `…/{id}/accept|reject`, `DELETE …/{id}` — manage (`notification.telegram.manage`)

UI: `/telegram` loads and mutates via **SSR** `loader`/`action` (`app/lib/server/notification.server.ts`) so the browser does not call `/notification/…` or `/auth/session/gateway/notification/…`. The `/notification` Vite/SSR gateway prefix remains for other/public proxy use.

**Production requires `AUTH_JWKS_URL` on the notification ECS task** — without it the API returns `503 auth not configured` and the tab fails to load. See [docs/ai-instruct-dupli1-notification-jwks.md](docs/ai-instruct-dupli1-notification-jwks.md).

## Auth (browser)

Server-side session storage keeps both refresh and access tokens off the browser entirely:

- No token of any kind is stored client-side (not in `localStorage`, not in a readable cookie).
- Refresh token and a short-lived cached access token live in the session store, keyed by `session_id`. **Backed by Redis when `REDIS_URL` is set** (`redis://redis.dupli1.local:6379` in ECS, set in this repo's `.aws/task-definition.json` — see [Production access](#production-access)), otherwise a per-process `Map` so `npm run dev` needs no infrastructure. The Map is only correct for a single task: the manage target group (`…-manage-inst-tg`) sets no stickiness, so a request landing on another task finds no session, **clears the cookie, and logs the operator out everywhere** — and a rolling deploy runs two tasks for the default 300s deregistration delay. Redis is not optional in ECS: the store **throws** rather than falling back to the Map when `REDIS_URL` is set and unreachable, so a lost Redis is a visible outage instead of intermittent logouts. The Redis task persists to EFS with AOF (backend `infra/terraform/redis_storage.tf`), so a restart no longer empties it, and it is replaced stop-before-start to keep a single writer on the append-only file — during that gap the store throws and the console errors for a few seconds, but nobody is signed out (see `ExchangeResult` below). `npm run test:session:shared` drives two dev servers against one Redis; run it with `REDIS_URL` unset and it must fail.
- `dupli1_sid` httpOnly cookie carries the session id; the browser never sees either token.
- `POST /auth/session/login`, `/auth/session/logout`, `GET /auth/session/me` proxy auth to the gateway and manage the session cookie. `/auth/session/refresh` always force-exchanges the refresh token (never returns a cached access token) — callers reach it after a 401, so the cached token is exactly what just failed.
- **Only auth's own verdict ends a session.** `exchangeRefreshToken` returns an `ExchangeResult`: `rejected` for a `401`/`403` (spent, revoked, locked — clear the session and the cookie) and `unavailable` for anything else, including the `503` auth returns when it cannot reach its own refresh-token ledger. That ledger is in Redis, whose task is replaced on every deploy, and the old code read **any** non-ok refresh as a spent token — so a few seconds of Redis downtime signed out every operator. On `unavailable` the BFF answers `503` with `code: "auth_unavailable"`, keeps the session and the cookie, and `getMe` rides out the gap with a short bounded retry before `/admin` offers a retry panel instead of redirecting to `/login`. The backend half is `auth/pkg/handler/handler.go`, which used to flatten a store outage into `401`.
- **Auth rotates refresh tokens.** Every exchange kills the token it was given and returns a replacement in `refresh_token` alongside `token`; `exchangeRefreshToken` returns both and each caller must persist the new one (`updateSessionRefreshToken`, or `createSession` at login — login spends the token once to prime the cache, so the one auth returned at login is already dead). Dropping the replacement stranded the session on a rejected token, so the first refresh 401'd and cleared the session: admin sessions lasted one access-token lifetime (15 min) instead of the session's 30 days. Exchanges are coalesced per session, because two parallel cache misses would spend the same token and the loser's 401 would tear down a healthy session. `npm run test:session` covers this against a real auth service.
- The session gateway forwards `Last-Event-ID` upstream (it rebuilds request headers from scratch), which is what lets the order stream resume after a reconnect. `EventSource` cannot see a status code, so `useOrderEvents` treats a permanently-closed stream as "refresh the session, then reconnect with backoff".
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

Admin surfaces: products (parent + variants with inline **price**, **officialPrice**, **attributes** key-value editor, and catalog master fields on PDP), **SKU detail** (`/products/:id/SKU/:skuId`), **catalog masters** (`/catalog`), orders, **promotional codes** (`/promotions`), users (**Customers / Managers / Services** tabs by `account_type`; service accounts have no password — `/users/new` omits it for them and their detail page's credentials tab is an **API keys** panel that shows a new key's plaintext once and never stores it), **Telegram** (`/telegram` — ops alert subscriptions), **Support** (`/support` — customer consultation inbox), settings (local UI; manager settings API still sketch on backend).

## Production access

Admin is published at **https://manage.dupli1.com**, served from VENUS (self-hosted, behind a Cloudflare Tunnel) since the move off AWS ECS on 2026-09-27.

**This repo deploys itself.** `.github/workflows/images.yml` publishes `ghcr.io/elug3/dupli1-manage-web:sha-<short>` on every push to `master`, then its deploy job runs `deploy.sh manage-web sha-<short>` from the backend repo's deploy checkout on the VENUS self-hosted runner. That restarts only the `manage-web` container, checks `/` and `/login`, and rolls back if they fail. **Environment variables for production live in the backend repo's `deploy/venus/docker-compose.yml`** (`manage-web` service), not here. Runbook: `../dupli1/docs/deployment-venus.md` → "Deploying new code". `.aws/task-definition.json` is left from ECS and no longer used.

- API calls use `DUPLI1_GATEWAY_URL` (`http://proxy.dupli1.local`, the VENUS gateway).
- The customer storefront (`dupli1-web`) is served from the same machine (`dupli1.com`).

## Sibling Projects

| Repo | Purpose |
|------|---------|
| `../dupli1` | Go backend — API contracts and domain model |
| `dupli1-web` | Customer storefront — copy patterns for routing, auth, API helpers |
