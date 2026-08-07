# AI instruction: wire `AUTH_JWKS_URL` on `dupli1-notification` (ECS)

**Target repo:** [elug3/dupli1](https://github.com/elug3/dupli1) — service **`dupli1-notification`** + Terraform.  
**Audience:** AI coding agents / operators applying the production fix.  
**Symptom in manage-web:** `/telegram` shows **Failed to load Telegram subscriptions** (upstream `503` `auth not configured`).

---

## Goal

Give the notification service a JWT validator in production so the manager Telegram subscription API can accept manage-web’s Bearer tokens.

---

## Why

Manage-web’s Telegram tab calls (via the session gateway):

```http
GET /api/v1/notification/telegram/subscriptions
```

Those routes use `requireAuth` in `notification/pkg/handler/http.go`. When `AUTH_JWKS_URL` (and `JWT_SECRET`) are unset, bootstrap leaves `jwtValidator == nil` and every authenticated call returns:

```json
{"error":"auth not configured"}
```

with status **503**.

Production ECS (`infra/terraform/ecs_services.tf` → `aws_ecs_task_definition.notification`) currently sets only:

- `NATS_URL`
- `MANAGE_WEB_URL`
- Telegram secrets (`TELEGRAM_BOT_TOKEN`, chat IDs, allowed user IDs)

It does **not** set `AUTH_JWKS_URL`, unlike product/order/cart/payment.

Local Docker Compose already sets `DUPLI1_NOTIFICATION_DB` and can set JWKS; the gap is **ECS Terraform**.

---

## Required changes (`dupli1`)

### 1. `infra/terraform/ecs_services.tf` — notification task `environment`

Add (same JWKS URL as the other services):

```hcl
{ name = "AUTH_JWKS_URL", value = "http://auth.dupli1.local:8080/api/v1/auth/.well-known/jwks.json" },
```

Recommended companion (inbound `/start` registrations for the tab):

```hcl
{ name = "TELEGRAM_WEBHOOK_URL", value = "https://dupli1.com/api/v1/notification/telegram/webhook" },
```

Do **not** inject `TELEGRAM_WEBHOOK_SECRET` from Secrets Manager unless that JSON key already exists on `dupli1/production/telegram` — a missing key prevents the task from starting.

### 2. `infra/scripts/create-rds-databases.sh`

Include `"notifications"` in `DATABASES=(...)`.

### 3. Docs

Update `docs/notification-telegram-bot.md`: mark `AUTH_JWKS_URL` as **required for manage-web**; note that without it the Telegram tab fails with `auth not configured`.

### 4. Follow-up (persistence, not required to unblock the tab)

Without `DUPLI1_NOTIFICATION_DB` the service uses the in-memory repository (empty after each deploy). To persist subscriptions:

1. Create RDS DB `notifications` (script above).
2. Create Secrets Manager secret `dupli1/production/notification-db-url` (same URL pattern as other `*-db-url` secrets).
3. Add `variable "notification_db_url_secret_arn"` and wire `DUPLI1_NOTIFICATION_DB` on the task like product/order.

---

## Deploy

```bash
# after merge + terraform apply (or forced new task definition)
aws ecs update-service --region us-east-1 \
  --cluster production --service dupli1-notification \
  --force-new-deployment
```

Verify:

```bash
# with a manager session cookie / Bearer token
curl -sS -H "Authorization: Bearer $TOKEN" \
  https://dupli1.com/api/v1/notification/telegram/subscriptions
# expect: {"items":[...]}  — not 503 auth not configured
```

Manage-web `/telegram` should then load (empty list is OK until someone messages the bot or a row is added manually).

---

## Out of scope

- manage-web path/prefix wiring (already correct: `/notification` → strip → `/api/v1/notification/...`)
- Granting `notification.telegram.read|manage` (owner `*` already covers them)
