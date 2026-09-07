# AI instruction: rename `DUPLI1_ORDER_SHIPPING_FEE_CENTS` → `DUPLI1_ORDER_SHIPPING_FEE_KRW`

**Target repo:** [elug3/dupli1](https://github.com/elug3/dupli1) — service **`dupli1-order`**.  
**Follow-up:** [elug3/dupli1-web](https://github.com/elug3/dupli1-web) comment in `app/lib/cart.ts`.  
**Audience:** AI coding agents implementing the rename in the backend.  
**Related frontend:** manage-web does **not** read this env var. It displays order totals the order API already stored.

---

## Goal

Rename the operator-facing shipping-fee environment variable so the unit is KRW, not “cents”:

| | Name |
|---|---|
| Canonical | `DUPLI1_ORDER_SHIPPING_FEE_KRW` |
| Deprecated alias | `DUPLI1_ORDER_SHIPPING_FEE_CENTS` |

The value is still **whole KRW won** (zero-decimal). `30000` means ₩30,000. Default when unset remains **30000**. `0` means free delivery.

---

## Why

KRW has no fractional subunit in this stack. `*_cents` on JSON fields (`subtotal_cents`, `total_cents`, `shipping_fee_cents`) is the existing money-field convention and should stay. The **env var** is what operators set in Compose / ECS, and `_CENTS` there is misleading.

---

## Do not change

- JSON `shipping_fee_cents` / Go `ShippingFeeCents` / DB column `shipping_fee_cents`
- Other `*_cents` money fields (`subtotal_cents`, `discount_cents`, `total_cents`, …)
- The default amount (`30000`) or pricing rules (flat per order, no free-shipping threshold, coupons discount goods only)

---

## Required changes (`dupli1`)

### 1. `order/cmd/options.go`

Prefer `DUPLI1_ORDER_SHIPPING_FEE_KRW`. If that is empty, fall back to `DUPLI1_ORDER_SHIPPING_FEE_CENTS`. Invalid values (non-integer or negative) are logged and ignored, leaving the 30000 default.

```go
func applyShippingFeeEnv(opts *order.ServerOptions) {
	name := "DUPLI1_ORDER_SHIPPING_FEE_KRW"
	v := os.Getenv(name)
	if v == "" {
		name = "DUPLI1_ORDER_SHIPPING_FEE_CENTS"
		v = os.Getenv(name)
	}
	if v == "" {
		return
	}
	krw, err := strconv.ParseInt(v, 10, 64)
	if err != nil || krw < 0 {
		log.Printf("order: ignoring invalid %s=%q", name, v)
		return
	}
	opts.ShippingFeeCents = krw
}
```

If both are set, **KRW wins**.

### 2. `order/pkg/options.go`

Update comments on `DefaultShippingFeeCents` and `ShippingFeeCents` to name `DUPLI1_ORDER_SHIPPING_FEE_KRW` (mention the CENTS alias).

### 3. Compose

`docker-compose.yml` and `docker-compose.prod.yml` — inject the new name, still honoring an old `.env` key:

```yaml
# Flat per-order delivery charge in whole KRW. Unset uses 30000; 0 is free.
# DUPLI1_ORDER_SHIPPING_FEE_CENTS is a deprecated alias.
DUPLI1_ORDER_SHIPPING_FEE_KRW: ${DUPLI1_ORDER_SHIPPING_FEE_KRW:-${DUPLI1_ORDER_SHIPPING_FEE_CENTS:-30000}}
```

### 4. Docs / examples

- `docs/api.md`, `docs/checkout-session.md`, `docs/current-state.md` — document `DUPLI1_ORDER_SHIPPING_FEE_KRW`; note the CENTS alias.
- Add the variable to the checkout-session configuration table.
- `.env.example` / `.env.prod.example` — commented `DUPLI1_ORDER_SHIPPING_FEE_KRW=30000`.
- `scripts/smoke-money-path.sh` — comment should name the KRW var.

ECS Terraform does **not** currently set this env var (the Go default of 30000 applies in production). No Terraform change is required unless you want the fee explicit on the task definition.

### 5. Tests

Add `order/cmd/options_test.go` covering:

- `DUPLI1_ORDER_SHIPPING_FEE_KRW=15000` → `ShippingFeeCents == 15000`
- legacy `DUPLI1_ORDER_SHIPPING_FEE_CENTS=0` → `0` (free)
- both set → KRW wins
- `DUPLI1_ORDER_SHIPPING_FEE_KRW=-1` → default `30000`

```bash
cd order && go test ./cmd ./pkg -count=1
```

---

## Follow-up (`dupli1-web`)

`app/lib/cart.ts` documents the order-service env var next to the display-only `SHIPPING_FEE` constant. Update that comment to `DUPLI1_ORDER_SHIPPING_FEE_KRW`. Do **not** rename JSON `shipping_fee_cents` on checkout/settings responses.

---

## Compatibility

| Config | After this change |
|---|---|
| Unset | ₩30,000 (unchanged Go default) |
| `DUPLI1_ORDER_SHIPPING_FEE_KRW=0` | Free |
| `DUPLI1_ORDER_SHIPPING_FEE_CENTS=…` only | Still honored |
| Both set | KRW name wins |
