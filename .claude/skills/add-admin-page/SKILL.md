---
name: add-admin-page
description: Checklist for adding or extending an admin page or backend-backed feature in dupli1-manage-web (route, sidebar link, API client, i18n in ko/en/zh-CN, mock gateway, tests). Use when asked to add a new screen, tab, or API-backed panel to the manage console.
---

# Add an admin page

Read [CLAUDE.md](../../../CLAUDE.md) first for the gateway prefixes, auth model and the section for the feature's backend. Link to it rather than copying it.

## 1. Confirm the contract before coding

- The backend is `../dupli1`. Find the endpoint in its `docs/` (index: `docs/README.md`) and the handler, and note the **permission** it needs. Do not guess field names.
- Money fields are `*_won` only. `*_krw` / `*_cents` are dead names: a client written with one reads `undefined`.
- Pick the data path:
  - Operator-private or customer data (support transcripts, kill switches, telegram): **SSR `loader`/`action`** with a `*.server.ts` helper in `app/lib/server/`, so it is never a browser-callable endpoint.
  - Everything else: a client helper using `authedFetch` (`app/lib/auth.ts`) to `/auth/session/gateway/*`. Never put a token in the browser.

## 2. Wire it up

1. `app/routes/<name>.tsx` with `loader` / `action` / default export.
2. Register in `app/routes.ts` **inside the `layout("routes/admin.tsx", [...])` block** so it is behind the auth check.
3. Add a `SidebarLink` in `app/routes/admin.tsx` only if it deserves a nav entry (kill switches, for example, has none).
4. Put API types and calls in `app/lib/<name>.ts` (pure logic, easy to test) rather than inside the route.
5. Strings: add every key to **all three** of `app/lib/i18n/messages/ko.ts`, `en.ts`, `zh-CN.ts`. KRW formatting goes through `formatCurrency` / `formatWon`.
6. A `403` should say which permission is missing (see the banners and points panels) rather than hiding the UI; the console does not know the operator's permissions up front.

## 3. Test it

- Unit tests (`*.test.ts` beside the helper, vitest) for parsing, formatting and request-shaping logic.
- Add the new endpoints to `scripts/mock-gateway.mjs` with seed data, and a `scripts/test-<name>-browser.mjs` plus an `npm run test:<name>:browser` script if the page has real interaction. Follow an existing one (`test-banners-browser.mjs` is a small model).
- Then run the **verify-change** skill.

## 4. Document

Add a short section to CLAUDE.md in the style of its neighbours (endpoints, permission, the file names, the test command) and keep it brief. Update `AGENTS.md` only if a rule for agents changed.
