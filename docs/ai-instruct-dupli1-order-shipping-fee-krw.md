# Shipping fee identifier is `shipping_fee_won`

**Target repos:** [elug3/dupli1](https://github.com/elug3/dupli1) (`dupli1-order`), [elug3/dupli1-web](https://github.com/elug3/dupli1-web), this manage-web app.  
**Audience:** AI coding agents. Do **not** rename this field back to `shipping_fee_cents`.

---

## Canonical names

| Layer | Name |
|---|---|
| JSON (orders, checkout sessions, NATS `order.*` events, `GET /api/v1/orders/settings` `limits`) | `shipping_fee_won` |
| Go | `ShippingFeeWon` |
| Postgres | `shipping_fee_won` |
| Operator env | `DUPLI1_ORDER_SHIPPING_FEE_WON` |
| TypeScript | `shippingFeeWon` / `getShippingFeeWon` / `useShippingFeeWon` |

The value is **whole KRW won** (zero-decimal). `30000` means ₩30,000. Default when the env is unset is **30000**. `0` means free delivery.

`DUPLI1_ORDER_SHIPPING_FEE_KRW` and `DUPLI1_ORDER_SHIPPING_FEE_CENTS` remain **deprecated aliases** for the env var only. If more than one is set, WON wins over KRW over CENTS. Existing databases rename `shipping_fee_cents` / `shipping_fee_krw` → `shipping_fee_won` on migrate (values preserved).

---

## Do not change

- Money identifiers stay `*_won` / `KRW` / `Krw`. Do not revert JSON, Go, Postgres, or TypeScript names to `*_cents`.
- The default amount (`30000`) or pricing rules (flat per order, no free-shipping threshold, coupons discount goods only).
- Display math: never divide by 100.

---

## manage-web

`Order.shipping_fee_won` is the snapshotted fee from the order API. The order detail totals breakdown (`app/routes/orders.$id.tsx`) shows it. Manage-web does **not** read the operator env var.

---

## Compatibility

| Config | Behavior |
|---|---|
| Unset | ₩30,000 (Go default) |
| `DUPLI1_ORDER_SHIPPING_FEE_WON=0` | Free |
| `DUPLI1_ORDER_SHIPPING_FEE_CENTS` only | Still honored |
| Both set | KRW name wins |
