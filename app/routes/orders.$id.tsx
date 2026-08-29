import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  type Order,
  type OrderItem,
  type OrderStatus,
  type ShipCarrier,
  SHIP_CARRIERS,
  getOrder,
  orderHasFulfillment,
  productImageSrc,
  shipOrder,
  updateOrderStatus,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "Order | Dupli1 Admin" }];
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-blue-100 text-blue-800",
  in_transit: "bg-violet-100 text-violet-800",
  fulfilled: "bg-emerald-100 text-emerald-800",
  canceled: "bg-slate-100 text-slate-600",
};

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  const labels: Record<OrderStatus, string> = {
    pending: t("common.orderStatusPending"),
    paid: t("common.orderStatusPaid"),
    in_transit: t("common.orderStatusInTransit"),
    fulfilled: t("common.orderStatusFulfilled"),
    canceled: t("common.orderStatusCanceled"),
  };
  const cls = STATUS_BADGE_CLASS[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

// ── Actions ───────────────────────────────────────────────────────────────────

type OrderAction =
  | { kind: "ship" }
  | { kind: "status"; status: "canceled" | "fulfilled" };

const ORDER_ACTIONS: Record<OrderStatus, OrderAction[]> = {
  pending: [{ kind: "status", status: "canceled" }],
  paid: [{ kind: "ship" }, { kind: "status", status: "canceled" }],
  in_transit: [{ kind: "status", status: "fulfilled" }],
  fulfilled: [],
  canceled: [],
};

function actionKey(a: OrderAction): string {
  return a.kind === "ship" ? "ship" : a.status;
}

function carrierLabelKey(carrier: string): string {
  switch (carrier) {
    case "cj":
      return "orderDetail.carrierCj";
    case "hanjin":
      return "orderDetail.carrierHanjin";
    case "lotte":
      return "orderDetail.carrierLotte";
    case "logen":
      return "orderDetail.carrierLogen";
    case "epost":
      return "orderDetail.carrierEpost";
    case "other":
      return "orderDetail.carrierOther";
    default:
      return "orderDetail.carrier";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPhoneDisplay(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("010"))
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10 && d.startsWith("01"))
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OrderDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { notify } = useNotify();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingAction, setUpdatingAction] = useState<string | null>(null);
  const [shipOpen, setShipOpen] = useState(false);
  const [carrier, setCarrier] = useState<ShipCarrier>("cj");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrierNote, setCarrierNote] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrder(id)
      .then((o) => {
        if (!cancelled) setOrder(o);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : t("orderDetail.failedToLoad")
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  async function handleAction(action: OrderAction) {
    if (!order) return;
    if (action.kind === "ship") {
      setShipOpen(true);
      return;
    }
    const key = actionKey(action);
    setUpdatingAction(key);
    try {
      const updated = await updateOrderStatus(order.id, action.status);
      setOrder(updated);
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : t("orderDetail.failedToUpdateStatus"),
        "error"
      );
    } finally {
      setUpdatingAction(null);
    }
  }

  async function confirmShip() {
    if (!order) return;
    const tracking = trackingNumber.trim();
    if (!tracking) {
      notify(t("orderDetail.shipHint"), "error");
      return;
    }
    if (carrier === "other" && !carrierNote.trim()) {
      notify(t("orderDetail.carrierNoteHint"), "error");
      return;
    }
    setUpdatingAction("ship");
    try {
      const updated = await shipOrder(order.id, {
        carrier,
        tracking_number: tracking,
        carrier_note: carrier === "other" ? carrierNote.trim() : undefined,
      });
      setOrder(updated);
      setShipOpen(false);
      setTrackingNumber("");
      setCarrierNote("");
      setCarrier("cj");
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : t("orderDetail.failedToUpdateStatus"),
        "error"
      );
    } finally {
      setUpdatingAction(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <Link to="/orders" className="text-sm text-accent hover:underline">
          {t("orderDetail.backToOrders")}
        </Link>
        <div className="rounded-2xl border border-edge bg-surface p-10 text-center text-muted">
          {error ?? t("orderDetail.notFound")}
        </div>
      </div>
    );
  }

  const actions = ORDER_ACTIONS[order.status] ?? [];

  return (
    <div className="space-y-6">
      <Link to="/orders" className="text-sm text-accent hover:underline">
        {t("orderDetail.backToOrders")}
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("orderDetail.orderId")}
            </p>
            <h1 className="mt-1 break-all font-mono text-lg font-bold text-ink">
              {order.id}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {t("orderDetail.customer")}:{" "}
              <span className="font-mono">{order.customer_id}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <OrderStatusBadge status={order.status} />
            {actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => {
                  const key = actionKey(action);
                  const busy = updatingAction === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={busy || updatingAction !== null}
                      onClick={() => handleAction(action)}
                      className={[
                        "rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50",
                        action.kind === "status" && action.status === "canceled"
                          ? "border border-red-200 text-danger-fg hover:bg-danger-bg"
                          : "bg-accent text-white hover:bg-accent-hover",
                      ].join(" ")}
                    >
                      {busy
                        ? t("common.loadingEllipsis")
                        : action.kind === "ship"
                          ? t("orders.actionShip")
                          : action.status === "canceled"
                            ? t("orders.actionCancel")
                            : t("orders.actionFulfill")}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TimelineSection order={order} />
          <ItemsSection order={order} />
        </div>
        <div className="space-y-6">
          <FulfillmentSection order={order} />
          <MetaSection order={order} />
        </div>
      </div>

      {shipOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ship-dialog-title"
            className="w-full max-w-md rounded-2xl border border-edge bg-surface p-6 shadow-xl"
          >
            <h2
              id="ship-dialog-title"
              className="text-lg font-semibold text-ink"
            >
              {t("orderDetail.shipTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted">{t("orderDetail.shipHint")}</p>
            <div className="mt-5 space-y-4">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-ink">
                  {t("orderDetail.carrier")}
                </span>
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value as ShipCarrier)}
                  className="w-full rounded-xl border border-edge bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                >
                  {SHIP_CARRIERS.map((code) => (
                    <option key={code} value={code}>
                      {t(carrierLabelKey(code))}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-ink">
                  {t("orderDetail.trackingNumber")}
                </span>
                <input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-full rounded-xl border border-edge bg-white px-3 py-2.5 font-mono text-sm text-ink outline-none focus:border-accent"
                  autoComplete="off"
                />
              </label>
              {carrier === "other" && (
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-ink">
                    {t("orderDetail.carrierNote")}
                  </span>
                  <input
                    value={carrierNote}
                    onChange={(e) => setCarrierNote(e.target.value)}
                    placeholder={t("orderDetail.carrierNoteHint")}
                    className="w-full rounded-xl border border-edge bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                    autoComplete="off"
                  />
                </label>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={updatingAction === "ship"}
                onClick={() => setShipOpen(false)}
                className="rounded-xl border border-edge px-4 py-2 text-sm font-semibold text-muted hover:bg-page"
              >
                {t("orderDetail.cancelShip")}
              </button>
              <button
                type="button"
                disabled={updatingAction === "ship"}
                onClick={() => void confirmShip()}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {updatingAction === "ship"
                  ? t("common.loadingEllipsis")
                  : t("orderDetail.confirmShip")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function TimelineSection({ order }: { order: Order }) {
  const { t, formatDate } = useI18n();
  const hasPending =
    order.status === "pending" && Boolean(order.payment_due_at);
  if (!order.paid_at && !order.shipped_at && !hasPending) return null;

  const dateOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };

  return (
    <div className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-6">
      <h2 className="mb-4 font-semibold text-ink">
        {t("orderDetail.timeline")}
      </h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        {hasPending && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("orders.paymentDue")}
            </dt>
            <dd className="mt-1 font-medium text-warn-fg">
              {formatDate(order.payment_due_at!, dateOpts)}
            </dd>
          </div>
        )}
        {order.paid_at && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("orders.paidAt")}
            </dt>
            <dd className="mt-1 font-medium text-ink">
              {formatDate(order.paid_at, dateOpts)}
            </dd>
          </div>
        )}
        {order.shipped_at && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("orders.shippedAt")}
            </dt>
            <dd className="mt-1 font-medium text-ink">
              {formatDate(order.shipped_at, dateOpts)}
              {order.shipped_by && (
                <span className="ml-1 text-muted">
                  {t("orders.shippedBy", { name: order.shipped_by })}
                </span>
              )}
            </dd>
          </div>
        )}
        {order.tracking_number && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("orderDetail.tracking")}
            </dt>
            <dd className="mt-1 font-medium text-ink">
              <span>
                {order.carrier === "other" && order.carrier_note
                  ? order.carrier_note
                  : order.carrier
                    ? t(carrierLabelKey(order.carrier))
                    : null}
              </span>
              {order.carrier && <span className="mx-1.5 text-faint">·</span>}
              <span className="font-mono">{order.tracking_number}</span>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// ── Items ─────────────────────────────────────────────────────────────────────

function ItemsSection({ order }: { order: Order }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-6">
      <h2 className="mb-4 font-semibold text-ink">
        {t("orders.orderItems")}
      </h2>
      <div className="space-y-3">
        {order.items.map((item, i) => (
          <OrderItemRow key={i} item={item} />
        ))}
      </div>
      <OrderTotals order={order} />
    </div>
  );
}

function OrderItemRow({ item }: { item: OrderItem }) {
  const { t, formatCents } = useI18n();
  const imgSrc = item.image_url ? productImageSrc(item.image_url) : null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={item.product_name ?? item.sku}
            className="h-9 w-9 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-page text-xs font-bold text-accent">
            {item.sku.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          {item.product_name && (
            <span className="block truncate text-xs font-semibold text-ink">
              {item.product_name}
            </span>
          )}
          <span className="block truncate font-mono text-xs text-muted">
            {item.sku}
            {item.available === false && (
              <span className="ml-1.5 rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-danger-fg">
                {t("orders.itemUnavailable")}
              </span>
            )}
          </span>
          {item.sku_id && (
            <span className="block truncate font-mono text-[10px] text-faint">
              {item.sku_id}
            </span>
          )}
          <span className="text-xs text-faint">
            {t("orders.quantityTimes", { quantity: item.quantity })}
          </span>
        </div>
      </div>
      <span className="shrink-0 font-semibold text-ink">
        {formatCents(item.unit_price_cents * item.quantity)}
      </span>
    </div>
  );
}

function OrderTotals({ order }: { order: Order }) {
  const { t, formatCents } = useI18n();
  const hasDiscount = order.discount_cents > 0;
  return (
    <div className="mt-4 space-y-1.5 border-t border-edge pt-4 text-sm">
      {hasDiscount && (
        <>
          <div className="flex items-center justify-between text-muted">
            <span>{t("orders.subtotal")}</span>
            <span>{formatCents(order.subtotal_cents)}</span>
          </div>
          <div className="flex items-center justify-between text-success-fg">
            <span>
              {order.coupon_code
                ? t("orders.discountWithCode", { code: order.coupon_code })
                : t("orders.discount")}
            </span>
            <span>−{formatCents(order.discount_cents)}</span>
          </div>
        </>
      )}
      <div className="flex items-center justify-between font-bold text-ink">
        <span>{t("orders.orderTotal")}</span>
        <span>{formatCents(order.total_cents)}</span>
      </div>
    </div>
  );
}

// ── Fulfillment ───────────────────────────────────────────────────────────────

function FulfillmentSection({ order }: { order: Order }) {
  const { t } = useI18n();

  if (!orderHasFulfillment(order)) {
    return (
      <div className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
        <h2 className="mb-3 font-semibold text-ink">
          {t("orders.fulfillment")}
        </h2>
        <p className="text-sm text-faint">{t("orders.noFulfillment")}</p>
      </div>
    );
  }

  const addr = order.shipping_address;
  const addrLines = [
    addr?.address_line1,
    addr?.address_line2,
    [addr?.city, addr?.province].filter(Boolean).join(" "),
    addr?.postal_code
      ? t("orders.postalCodeValue", { code: addr.postal_code })
      : undefined,
  ].filter((l): l is string => Boolean(l?.trim()));

  return (
    <div className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
      <h2 className="mb-4 font-semibold text-ink">
        {t("orders.fulfillment")}
      </h2>
      <dl className="space-y-3 text-sm">
        {order.recipient_name && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("orders.recipientName")}
            </dt>
            <dd className="mt-1 font-medium text-ink">
              {order.recipient_name}
            </dd>
          </div>
        )}
        {order.recipient_phone && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("orders.recipientPhone")}
            </dt>
            <dd className="mt-1 font-medium text-ink">
              {formatPhoneDisplay(order.recipient_phone)}
            </dd>
          </div>
        )}
        {addrLines.length > 0 && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("orders.shippingAddress")}
            </dt>
            <dd className="mt-1 space-y-0.5 text-ink">
              {addrLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

function MetaSection({ order }: { order: Order }) {
  const { t, formatDate } = useI18n();
  const dateOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  return (
    <div className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
      <h2 className="mb-4 font-semibold text-ink">
        {t("orderDetail.meta")}
      </h2>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
            {t("orderDetail.createdAt")}
          </dt>
          <dd className="mt-1 text-ink">
            {formatDate(order.created_at, dateOpts)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
            {t("orderDetail.updatedAt")}
          </dt>
          <dd className="mt-1 text-ink">
            {formatDate(order.updated_at, dateOpts)}
          </dd>
        </div>
        {order.payment_id && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("orderDetail.paymentId")}
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-muted">
              {order.payment_id}
            </dd>
          </div>
        )}
        {order.reservation_id && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("orderDetail.reservationId")}
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-muted">
              {order.reservation_id}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
