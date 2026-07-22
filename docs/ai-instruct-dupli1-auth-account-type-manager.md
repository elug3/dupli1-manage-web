# AI instruction: rename auth `account_type` `admin` → `manager`

**Target repo:** [elug3/dupli1](https://github.com/elug3/dupli1) — service **`dupli1-auth`** (`auth/`).  
**Audience:** AI coding agents implementing the rename in the backend.  
**Related frontend:** `dupli1-manage-web` already displays and edits `manager`; it still maps `manager` ↔ `admin` on the wire until this backend change lands.

---

## Goal

Use the correct account-type name in **dupli1-auth**.

| Concept | Correct name | Notes |
|---------|--------------|--------|
| Account type (JSON `account_type`, DB column) | `customer` \| **`manager`** \| `service` | Human operators are **`manager`** |
| Management / permission tier | `admin` (e.g. `admin.*`, ABAC `ClassAdmin`) | **Not** an account type |

**Do not** use `admin` as an `account_type` value. `admin` is a role/tier derived from permissions (e.g. `admin.*` or owner `*`), not a stored account type.

Canonical values after the change:

```text
customer | manager | service
```

---

## Why

- Manage-web `/users/{id}` and product language treat human operators as **managers** (see Users tabs: customers / managers).
- Auth ABAC already distinguishes **ClassManager** vs **ClassAdmin** from **permissions**, while both were incorrectly forced through `account_type: "admin"`.
- Keeping `admin` as an account type confuses agents and operators with the `admin.*` permission wildcard.

---

## Required code changes (`auth/`)

1. **`auth/pkg/domain/account_type.go`**
   - Rename `AccountTypeAdmin = "admin"` → `AccountTypeManager = "manager"`.
   - Update `AllAccountTypes` and `ValidAccountType` to accept `manager` (not `admin`).
   - Optionally accept legacy `"admin"` only in a short migration/compat path (read/normalize), then persist `manager`. Prefer a one-shot DB migration over permanent dual-write if possible.

2. **ABAC (`auth/pkg/domain/abac.go` and tests)**
   - Replace `case AccountTypeAdmin` with `AccountTypeManager` where classifying human operators.
   - Keep **ClassAdmin** / **ClassManager** / **ClassOwner** as permission-derived management classes. Do **not** rename those to remove “admin” — that word belongs there.

3. **Bootstrap / seed**
   - Owner and human seed accounts: `account_type` = `manager` (owner still gets `permissions: ["*"]`).
   - Service accounts stay `account_type: service`.
   - Update any SQL in `migrate.go` that sets `account_type = 'admin'` for non-customers → `'manager'`, and migrate existing rows:

     ```sql
     UPDATE users SET account_type = 'manager' WHERE account_type = 'admin';
     ```

4. **Handlers, services, tests, OpenAPI**
   - JSON examples and registers: `manager` instead of `admin` for human operators.
   - Fix all `auth` package tests (`AccountTypeAdmin` → `AccountTypeManager`, string literals `"admin"` → `"manager"` where they mean account type).
   - Update `api/specs/auth-v1.yaml` and docs that list account types (`docs/api.md`, `docs/current-state.md`, `docs/service-layout.md`, `docs/permissions.md` account-type sections).

5. **Do not change**
   - Permission string `admin.*` or wildcard evaluation.
   - JWT claim shape (`permissions` array) — still no `account_type` in the access token unless already present by design.
   - Other services’ permission checks that mention “admin” in comments meaning elevated permissions.

---

## Compatibility with frontends

Until manage-web drops its wire mapping:

- Responses may temporarily include only `manager` (preferred).
- manage-web already treats API `admin` **or** `manager` as UI `manager`, and currently **sends** `admin` when saving. After auth accepts `manager`, update manage-web to send `manager` and remove `toApiAccountType` / `normalizeAccountType` shims (`app/lib/api.ts`).

Suggested order:

1. Auth accepts **both** `admin` and `manager` on write; always stores/returns `manager`.
2. Update manage-web (and dupli1-web if needed) to send `manager`.
3. Auth rejects `admin` on write (optional follow-up).

---

## Acceptance checks

```bash
cd auth && go test ./...
```

- `ValidAccountType("manager") == true`
- `ValidAccountType("admin") == false` (after compat window closes) or normalizes to manager during transition
- Register / `PATCH …/permissions` with `account_type: "manager"` succeeds for allowed callers
- Seeded owner/human operators have `account_type: "manager"` in DB
- Docs and OpenAPI enum: `customer`, `manager`, `service` only

---

## Prompt (paste into a dupli1 cloud agent)

```text
In dupli1-auth, rename account_type value "admin" to "manager".

Context: admin is a permission/management tier (admin.*, ABAC ClassAdmin), not an account type.
Canonical account types must be: customer | manager | service.

Update auth/pkg/domain/account_type.go, ABAC switches, bootstrap/migrate (UPDATE existing
account_type='admin' → 'manager'), handlers, tests, OpenAPI, and docs (api.md, permissions.md,
current-state, service-layout). Keep permission wildcard admin.* and ClassAdmin unchanged.

Prefer a short read-compat window (accept legacy "admin" on input, persist "manager") then
document that manage-web should stop mapping manager→admin on the wire.

Run: cd auth && go test ./...
```
