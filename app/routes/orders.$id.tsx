import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  type Order,
  type OrderItem,
  type OrderStatus,
  type ShipCarrier,
  SHIP_CARRIERS,
  approveOrderCancel,
  confirmOrder,
  deliverOrder,
  getOrder,
  orderHasFulfillment,
  productImageSrc,
  rejectOrderCancel,
  resolveDisputeFulfilled,
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
  confirmed: "bg-sky-100 text-sky-800",
  in_transit: "bg-violet-100 text-violet-800",
  delivered: "bg-teal-100 text-teal-800",
  fulfilled: "bg-emerald-100 text-emerald-800",
  disputed: "bg-red-100 text-red-800",
  canceled: "bg-slate-100 text-slate-600",
};

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  const labels: Record<OrderStatus, string> = {
    pending: t("common.orderStatusPending"),
    paid: t("common.orderStatusPaid"),
    confirmed: t("common.orderStatusConfirmed"),
    in_transit: t("common.orderStatusInTransit"),
    delivered: t("common.orderStatusDelivered"),
    fulfilled: t("common.orderStatusFulfilled"),
    disputed: t("common.orderStatusDisputed"),
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
  | { kind: "confirm" }
  | { kind: "ship" }
  | { kind: "deliver" }
  | { kind: "approve_cancel" }
  | { kind: "reject_cancel" }
  | { kind: "resolve_dispute" }
  | { kind: "status"; status: "canceled" | "fulfilled" };

/**
 * Actions available at each stage of
 * pending -> paid -> confirmed -> in_transit -> delivered -> fulfilled
 * (or disputed, from delivered).
 *
 * A plain "Cancel" is the manager's own direct override (refunds
 * immediately); it is replaced by Approve/Reject whenever the customer has
 * an open cancel request the manager must answer instead.
 */
function orderActions(order: Order): OrderAction[] {
  switch (order.status) {
    case "pending":
      return [{ kind: "status", status: "canceled" }];
    case "paid":
      return [{ kind: "confirm" }, { kind: "status", status: "canceled" }];
    case "confirmed":
      return withCancelOrRequest(order, [{ kind: "ship" }]);
    case "in_transit":
      return withCancelOrRequest(order, [{ kind: "deliver" }]);
    case "delivered":
      return withCancelOrRequest(order, [
        { kind: "status", status: "fulfilled" },
      ]);
    case "disputed":
      return [
        { kind: "resolve_dispute" },
        { kind: "status", status: "canceled" },
      ];
    case "fulfilled":
    case "canceled":
      return [];
  }
}

function withCancelOrRequest(
  order: Order,
  leading: OrderAction[]
): OrderAction[] {
  return order.cancel_requested_at
    ? [...leading, { kind: "approve_cancel" }, { kind: "reject_cancel" }]
    : [...leading, { kind: "status", status: "canceled" }];
}

function actionKey(a: OrderAction): string {
  return a.kind === "status" ? a.status : a.kind;
}

function actionLabel(a: OrderAction, t: (key: string) => string): string {
  switch (a.kind) {
    case "confirm":
      return t("orderDetail.confirmOrder");
    case "ship":
      return t("orders.actionShip");
    case "deliver":
      return t("orderDetail.deliverOrder");
    case "approve_cancel":
      return t("orderDetail.approveCancel");
    case "reject_cancel":
      return t("orderDetail.rejectCancel");
    case "resolve_dispute":
      return t("orderDetail.resolveDispute");
    case "status":
      return a.status === "canceled"
        ? t("orders.actionCancel")
        : t("orders.actionFulfill");
  }
}

/** Destructive-looking actions: refunds, or answering a cancel request. */
function isDangerAction(a: OrderAction): boolean {
  return (
    (a.kind === "status" && a.status === "canceled") ||
    a.kind === "approve_cancel" ||
    a.kind === "reject_cancel"
  );
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

    if (action.kind === "status" && action.status === "canceled") {
      const shipped =
        order.status === "in_transit" ||
        order.status === "delivered" ||
        order.status === "disputed";
      const paidWithCapture = order.status !== "pending" && Boolean(order.payment_id);
      const message = shipped
        ? t("orderDetail.confirmCancelShipped")
        : paidWithCapture
          ? t("orderDetail.confirmCancelPaid")
          : t("orderDetail.confirmCancel");
      if (!window.confirm(message)) return;
    }
    if (action.kind === "approve_cancel") {
      if (!window.confirm(t("orderDetail.confirmApproveCancel"))) return;
    }

    setUpdatingAction(key);
    try {
      let updated: Order;
      switch (action.kind) {
        case "confirm":
          updated = await confirmOrder(order.id);
          break;
        case "deliver":
          updated = await deliverOrder(order.id);
          break;
        case "approve_cancel":
          updated = await approveOrderCancel(order.id);
          break;
        case "reject_cancel":
          updated = await rejectOrderCancel(order.id);
          break;
        case "resolve_dispute":
          updated = await resolveDisputeFulfilled(order.id);
          break;
        case "status":
          updated = await updateOrderStatus(order.id, action.status);
          break;
      }
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

  const actions = orderActions(order);

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
            <div className="flex items-center gap-2">
              {order.status === "paid" && !order.confirmed_at && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  {t("orderDetail.unconfirmed")}
                </span>
              )}
              <OrderStatusBadge status={order.status} />
            </div>
            {actions.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2">
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
                        isDangerAction(action)
                          ? "border border-red-200 text-danger-fg hover:bg-danger-bg"
                          : "bg-accent text-white hover:bg-accent-hover",
                      ].join(" ")}
                    >
                      {busy ? t("common.loadingEllipsis") : actionLabel(action, t)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <OrderPolicyBanner order={order} />
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

// ── Policy banner ─────────────────────────────────────────────────────────────

const BANNER_DATE_OPTS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * Surfaces whatever the operator needs to act on or be aware of: the 2-hour
 * confirm SLA, a pending cancel request, a delivered order's auto-fulfill
 * window, or an open non-receipt dispute. Hidden once the order reaches a
 * final status (fulfilled/canceled clear all of these).
 */
function OrderPolicyBanner({ order }: { order: Order }) {
  const { t, formatDate } = useI18n();

  const showConfirmationDue =
    order.status === "paid" &&
    !order.confirmed_at &&
    (order.confirmation_overdue || order.confirmation_due_at);
  const showCancelRequest = Boolean(order.cancel_requested_at);
  const showAutoFulfillDue =
    order.status === "delivered" && Boolean(order.auto_fulfill_due_at);
  const showDispute = order.status === "disputed";

  if (
    !showConfirmationDue &&
    !showCancelRequest &&
    !showAutoFulfillDue &&
    !showDispute
  ) {
    return null;
  }

  return (
    <div className="mt-5 space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      {showConfirmationDue && (
        <p>
          {order.confirmation_overdue
            ? t("orderDetail.confirmationOverdue")
            : t("orderDetail.confirmationDue", {
                time: formatDate(order.confirmation_due_at ?? "", BANNER_DATE_OPTS),
              })}
        </p>
      )}
      {showCancelRequest && (
        <div>
          <p className="font-semibold">{t("orderDetail.cancelRequested")}</p>
          {order.cancel_request_reason ? (
            <p className="mt-0.5">
              {t("orderDetail.cancelRequestedReason", {
                reason: order.cancel_request_reason,
              })}
            </p>
          ) : null}
          <p className="mt-1">
            {order.cancel_confirm_overdue
              ? t("orderDetail.cancelConfirmOverdue")
              : t("orderDetail.cancelConfirmDue", {
                  time: formatDate(order.cancel_confirm_due_at ?? "", BANNER_DATE_OPTS),
                })}
          </p>
        </div>
      )}
      {showAutoFulfillDue && (
        <p>
          {t("orderDetail.autoFulfillDue", {
            time: formatDate(order.auto_fulfill_due_at ?? "", BANNER_DATE_OPTS),
          })}
        </p>
      )}
      {showDispute && (
        <div>
          <p className="font-semibold">{t("orderDetail.disputeReported")}</p>
          {order.dispute_reason ? (
            <p className="mt-0.5">
              {t("orderDetail.disputeReason", { reason: order.dispute_reason })}
            </p>
          ) : null}
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
  if (
    !order.paid_at &&
    !order.shipped_at &&
    !order.delivered_at &&
    !hasPending
  )
    return null;

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
        {order.delivered_at && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("orderDetail.deliveredAt")}
            </dt>
            <dd className="mt-1 font-medium text-ink">
              {formatDate(order.delivered_at, dateOpts)}
              {order.delivered_by && (
                <span className="ml-1 text-muted">
                  {t("orderDetail.deliveredBy", { name: order.delivered_by })}
                </span>
              )}
            </dd>
          </div>
        )}
        {order.receipt_confirmed_at && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("orders.receiptConfirmedAt")}
            </dt>
            <dd className="mt-1 font-medium text-ink">
              {formatDate(order.receipt_confirmed_at, dateOpts)}
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
  const { t, formatWon } = useI18n();
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
        {formatWon(item.unit_price_won * item.quantity)}
      </span>
    </div>
  );
}

function OrderTotals({ order }: { order: Order }) {
  const { t, formatWon } = useI18n();
  const hasDiscount = order.discount_won > 0;
  const shipping = order.shipping_fee_won ?? 0;
  return (
    <div className="mt-4 space-y-1.5 border-t border-edge pt-4 text-sm">
      <div className="flex items-center justify-between text-muted">
        <span>{t("orders.subtotal")}</span>
        <span>{formatWon(order.subtotal_won)}</span>
      </div>
      <div className="flex items-center justify-between text-muted">
        <span>{t("orders.shippingFee")}</span>
        <span>
          {shipping === 0
            ? t("orders.shippingFeeFree")
            : formatWon(shipping)}
        </span>
      </div>
      {hasDiscount && (
        <div className="flex items-center justify-between text-success-fg">
          <span>
            {order.coupon_code
              ? t("orders.discountWithCode", { code: order.coupon_code })
              : t("orders.discount")}
          </span>
          <span>−{formatWon(order.discount_won)}</span>
        </div>
      )}
      <div className="flex items-center justify-between font-bold text-ink">
        <span>{t("orders.orderTotal")}</span>
        <span>{formatWon(order.total_won)}</span>
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
        {addr?.pccc && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
              {t("orders.pccc")}
            </dt>
            <dd className="mt-1 font-medium text-[#1C1B1F]">{addr.pccc}</dd>
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
