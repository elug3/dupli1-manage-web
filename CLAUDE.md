# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For concise, machine-focused guidance for AI coding agents, see [AGENTS.md](AGENTS.md).

## Purpose

`schick-manage-web` is the admin/management dashboard for the Schick e-commerce platform. It is the counterpart to `schick-web` (customer-facing storefront) and connects to the same Go backend (`schick`).

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

## Backend

The Schick backend runs at `localhost:8080`. Configure the Vite dev proxy the same way as `schick-web`:

```ts
// vite.config.ts
proxy: {
  "/api/v1": { target: "http://localhost:8080", changeOrigin: true },
  "/api":    { target: "http://localhost:8081", changeOrigin: true },
}
```

Admin-only endpoints live under the same `schick` service routes (see `../schick/README.md`). The management dashboard primarily drives:

- `POST /api/v1/products`, `PUT /api/v1/products/:id`, `DELETE /api/v1/products/:id`
- `PUT /api/v1/orders/:id/status`
- `GET /api/v1/analytics/*`
- `GET|PUT /api/v1/config/*` (Super Admin only)

## Auth

Reuse the same JWT/refresh-token pattern from `schick-web`:

- Tokens stored in `localStorage` as `schick_at` (access) and `schick_rt` (refresh).
- `authedFetch` wraps `fetch`, attaches `Authorization: Bearer <token>`, and transparently retries once after a 401 by hitting `/api/v1/auth/refresh`.
- Copy or extract `app/lib/auth.ts` from `../schick-web` as the starting point.

## Architecture

Follow the same file layout as `schick-web`:

```
app/
  root.tsx          Document shell, top/side nav, error boundary
  routes.ts         Route registration (file-based via @react-router/dev/routes)
  app.css           Global styles and Tailwind import
  routes/           One file per route
  lib/              Shared utilities (api.ts, auth.ts, …)
```

Route modules use React Router 7 conventions: `loader` for data fetching, `action` for mutations, `default` export for the component.

## Sibling Projects

| Repo | Purpose |
|------|---------|
| `../schick` | Go backend — API contracts and domain model |
| `../schick-web` | Customer storefront — copy patterns for routing, auth, API helpers |
