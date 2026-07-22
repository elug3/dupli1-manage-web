# AGENTS.md

This file provides concise instructions for AI coding agents working in this repository.

Status
- `dupli1-manage-web` is the **admin/management dashboard** for the Dupli1 marketplace (React Router 7 + React 19 + Vite + Tailwind v4, SSR). It is the counterpart to `dupli1-web` (customer storefront) and talks to the same backend nginx gateway.
- See [CLAUDE.md](CLAUDE.md) for the architecture, route map, backend API contracts, and standard commands (`npm run dev`, `npm run build`, `npm run typecheck`).
- Product creates require existing catalog master codes (`brandCode`/`styleCode`, variant `colorCode`/`sizeCode`); manage dictionaries at `/catalog`.
- Account types in the UI are `customer` | `manager` | `service`. Auth may still wire human operators as `admin` until [dupli1-auth is updated](docs/ai-instruct-dupli1-auth-account-type-manager.md) — see that AI instruct before changing naming in either repo.

Agent interaction rules
- Keep changes minimal and scoped. When creating or updating customization files, explain why each change is needed.
- Link to existing docs rather than duplicating content.
- Do not run or store secrets. If a task requires credentials or sensitive input, request them from the user and do not persist them.

Where to find more info
- Use the repository files and any `docs/`, `README.md`, `CONTRIBUTING.md`, or `ARCHITECTURE.md`. Prefer linking to those files. Architecture and API contracts live in [CLAUDE.md](CLAUDE.md). Backend SKU/catalog details: `../dupli1/docs/product-sku-system.md`.

## Cursor Cloud specific instructions

- Dependencies (`npm install`) are refreshed automatically by the cloud update script; no manual install needed on a fresh VM.
- Dev server: `npm run dev` (defaults to `http://localhost:5173`). The sibling storefront (`dupli1-web`) also defaults to 5173, so when running both, start one on another port, e.g. `npm run dev -- --port 5174`.
- This app needs the **`dupli1` backend running** (nginx gateway at `http://localhost:8080`). See `../dupli1/AGENTS.md` for starting Docker + `docker compose up`. The SSR server reads `DUPLI1_GATEWAY_URL` (default `http://localhost:8080`) for backend calls.
- Product image `<img>` tags use `productImageSrc` so gateway MinIO URLs (`/product-images/…`) load via the manage-web origin. Private AWS S3 image URLs still fail in the browser until `dupli1` exposes them (CloudFront or gateway proxy) — see CLAUDE.md “Product images”.
- Product prices and order totals display as **KRW only** (`STORE_CURRENCY` / `formatCurrency` / `formatCents` in `app/lib/i18n`). Settings currency is locked to KRW (not a multi-currency picker).
- Log in at `/login` with the seeded owner account `admin@dupli1.com` / `password`. A transient "bad gateway" banner can appear if the backend gateway isn't fully up yet — retry once the stack is healthy.
