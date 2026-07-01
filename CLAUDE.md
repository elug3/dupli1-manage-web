# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For concise, machine-focused guidance for AI coding agents, see [AGENTS.md](AGENTS.md).

## Purpose

`schick-manage-web` is the admin/management dashboard for the Schick e-commerce platform. It is the counterpart to `schick-web` (customer-facing storefront) and connects to the same Go microservices via an nginx gateway.

## Expected Stack

Mirror `schick-web` exactly:

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
| `/auth/` | schick-auth |
| `/product/` | schick-product |
| `/inventory/` | schick-inventory |
| `/order/` | schick-order |

Client paths use the gateway prefix, e.g. `GET /product/api/categories`. The Vite dev proxy rewrites prefixes the same way nginx does.

Set `SCHICK_GATEWAY_URL` (default `http://localhost:8080`) for SSR server-side backend calls.

### Auth (`/auth`)

- `POST /auth/api/v1/auth/register` — create account
- `POST /auth/api/v1/auth/login` — returns `{ refresh_token }`
- `POST /auth/api/v1/auth/refresh` — `{ refresh_token }` → `{ token }` (access token)
- `POST /auth/api/v1/auth/logout` — `204`

### Product (`/product`)

Read-only catalog search: `/product/api/categories`, `/product/api/filters`, `/product/api/products/search`.

### Order (`/order`)

`/order/api/v1/orders`, `/order/api/v1/orders/{id}`, `PUT /order/api/v1/orders/{id}/status`.

### Inventory (`/inventory`)

`/inventory/api/v1/inventory/{sku}`, adjust, reservations.

## Auth (browser)

Server-side session storage keeps refresh tokens off the browser:

- Access token only in `localStorage` as `schick_at`.
- Refresh token stored in the SSR server's in-memory session cache, keyed by `session_id`.
- `schick_sid` httpOnly cookie carries the session id; the browser never sees the refresh token.
- `POST /auth/session/login`, `/auth/session/refresh`, `/auth/session/logout`, `GET /auth/session/me` proxy auth to the gateway and manage the session cookie.
- `authedFetch` attaches `Authorization: Bearer <token>` and retries once via `/auth/session/refresh` on 401.

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

- `schick-manage-web` runs in **private subnets** with no public IP and no ALB attachment.
- Managers connect via the **WireGuard VPN** (`schick-internal-vpn`), then open:

  **http://manage.schick.internal**

  Use `schick.internal` (not `schick.local`) on Android — Chrome treats `.local` as mDNS and won't query the VPC DNS resolver.

- API calls from manage-web reach backends via `SCHICK_GATEWAY_URL=http://proxy.schick.local` (internal nginx gateway).
- The customer storefront (`schick-web`) remains public via `schick-prod-alb`.

## Sibling Projects

| Repo | Purpose |
|------|---------|
| `../schick` | Go backend — API contracts and domain model |
| `schick-web` | Customer storefront — copy patterns for routing, auth, API helpers |
