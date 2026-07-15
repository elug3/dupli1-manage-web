import { useEffect, useState } from "react";
import {
  type Order,
  type OrderItem,
  type OrderStatus,
  type SkuVariantContext,
  buildVariantSkuIndex,
  formatOrderItemVariant,
  getOrders,
  listAllProducts,
  shipOrder,
  updateOrderStatus,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "Orders | Dupli1 Admin" }];
}

const STATUS_TAB_VALUES: (OrderStatus | "all")[] = [
  "all",
  "pending",
  "paid",
  "in_transit",
  "fulfilled",
  "canceled",
];

/** UI actions for the order lifecycle (ship uses POST /ship). */
type OrderAction =
  | { kind: "ship" }
  | { kind: "status"; status: "canceled" | "fulfilled" };

const ORDER_ACTIONS: Record<OrderStatus, OrderAction[]> = {
  pending: [{ kind: "status", status: "canceled" }],
  paid: [
    { kind: "ship" },
    { kind: "status", status: "canceled" },
  ],
  in_transit: [{ kind: "status", status: "fulfilled" }],
  fulfilled: [],
  canceled: [],
};

function orderStatusLabel(
  status: OrderStatus,
  t: (key: string) => string
): string {
  switch (status) {
    case "pending":
      return t("common.orderStatusPending");
    case "paid":
      return t("common.orderStatusPaid");
    case "in_transit":
      return t("common.orderStatusInTransit");
    case "fulfilled":
      return t("common.orderStatusFulfilled");
    case "canceled":
      return t("common.orderStatusCanceled");
    default:
      return status;
  }
}

function orderActionLabel(
  action: OrderAction,
  t: (key: string) => string
): string {
  if (action.kind === "ship") return t("orders.actionShip");
  if (action.status === "canceled") return t("orders.actionCancel");
  return t("orders.actionFulfill");
}

function orderActionKey(action: OrderAction): string {
  return action.kind === "ship" ? "ship" : `status:${action.status}`;
}

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-blue-100 text-blue-800",
  in_transit: "bg-violet-100 text-violet-800",
  fulfilled: "bg-emerald-100 text-emerald-800",
  canceled: "bg-slate-100 text-slate-600",
};

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  const cls = STATUS_BADGE_CLASS[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {orderStatusLabel(status, t)}
    </span>
  );
}

export default function Orders() {
  const { notify } = useNotify();
  const { t } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [skuLookup, setSkuLookup] = useState<Map<string, SkuVariantContext>>(
    () => new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OrderStatus | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.all([
      getOrders().catch((err) => {
        setError(
          err instanceof Error ? err.message : t("orders.failedToLoad")
        );
        return [] as Order[];
      }),
      listAllProducts().catch(() => []),
    ])
      .then(([orderList, products]) => {
        setOrders(orderList);
        setSkuLookup(buildVariantSkuIndex(products));
      })
      .finally(() => setLoading(false));
  }, [t]);

  const filtered =
    activeTab === "all"
      ? orders
      : orders.filter((o) => o.status === activeTab);

  const counts = orders.reduce(
    (acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<OrderStatus, number>
  );

  const statusTabLabel = (value: OrderStatus | "all"): string => {
    switch (value) {
      case "all":
        return t("orders.tabAll");
      case "pending":
        return t("orders.tabPending");
      case "paid":
        return t("orders.tabPaid");
      case "in_transit":
        return t("orders.tabInTransit");
      case "fulfilled":
        return t("orders.tabFulfilled");
      case "canceled":
        return t("orders.tabCanceled");
      default:
        return value;
    }
  };

  async function handleOrderAction(order: Order, action: OrderAction) {
    setUpdatingId(order.id);
    try {
      const updated =
        action.kind === "ship"
          ? await shipOrder(order.id)
          : await updateOrderStatus(order.id, action.status);
      setOrders((os) =>
        os.map((o) => (o.id === order.id ? updated : o))
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("orders.failedToUpdateStatus"),
        "error"
      );
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">
            {t("orders.title")}
          </h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">
            {t("orders.ordersTotal", { count: orders.length })}
          </p>
        </div>
        <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#E5E3EE] bg-white px-4 py-2.5 text-sm text-[#6B6480] shadow-[0_1px_3px_rgba(28,27,31,0.04)] sm:w-auto sm:justify-start">
          <svg className="size-4" viewBox="0 0 24 24" fill="none">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {t("orders.exportCsv")}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Status tabs */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex w-max max-w-full flex-wrap gap-1 rounded-xl border border-[#E5E3EE] bg-white p-1 shadow-[0_1px_3px_rgba(28,27,31,0.04)] sm:w-fit">
        {STATUS_TAB_VALUES.map((value) => {
          const count =
            value === "all"
              ? orders.length
              : (counts[value] ?? 0);
          return (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={[
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                activeTab === value
                  ? "bg-[#6D4AFF] text-white shadow-sm"
                  : "text-[#6B6480] hover:bg-[#F4F3F8] hover:text-[#1C1B1F]",
              ].join(" ")}
            >
              {statusTabLabel(value)}
              {count > 0 && (
                <span
                  className={[
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    activeTab === value
                      ? "bg-white/20 text-white"
                      : "bg-[#F4F3F8] text-[#6B6480]",
                  ].join(" ")}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
        </div>
      </div>

      {/* Orders list */}
      <div className="rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-[#9D98B3]">
            {t("orders.noOrdersInStatus")}
          </div>
        ) : (
          <>
            <div className="divide-y divide-[#F0EEF8] md:hidden">
              {filtered.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  skuLookup={skuLookup}
                  expanded={expandedId === order.id}
                  updating={updatingId === order.id}
                  onToggle={() =>
                    setExpandedId(expandedId === order.id ? null : order.id)
                  }
                  onAction={(action) => handleOrderAction(order, action)}
                />
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F0EEF8] bg-[#FAFAFA]">
                    {(
                      [
                        ["id", t("orders.colOrderId")],
                        ["customer", t("orders.colCustomer")],
                        ["items", t("orders.colItems")],
                        ["total", t("orders.colTotal")],
                        ["status", t("orders.colStatus")],
                        ["date", t("orders.colDate")],
                        ["actions", ""],
                      ] as const
                    ).map(([key, label]) => (
                      <th
                        key={key}
                        className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#9D98B3]"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => (
                    <OrderRows
                      key={order.id}
                      order={order}
                      skuLookup={skuLookup}
                      expanded={expandedId === order.id}
                      updating={updatingId === order.id}
                      onToggle={() =>
                        setExpandedId(
                          expandedId === order.id ? null : order.id
                        )
                      }
                      onAction={(action) => handleOrderAction(order, action)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  skuLookup,
  expanded,
  updating,
  onToggle,
  onAction,
}: {
  order: Order;
  skuLookup: Map<string, SkuVariantContext>;
  expanded: boolean;
  updating: boolean;
  onToggle: () => void;
  onAction: (action: OrderAction) => void;
}) {
  const { t, formatDate, formatCurrency } = useI18n();
  const actions = ORDER_ACTIONS[order.status] ?? [];

  function formatCents(cents: number) {
    return formatCurrency(cents / 100);
  }

  return (
    <div className="p-4">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs font-semibold text-[#1C1B1F]">
              {order.id}
            </p>
            <p className="mt-1 text-sm text-[#6B6480]">{order.customer_id}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-semibold text-[#1C1B1F]">
            {formatCents(order.total_cents)}
          </span>
          <span className="text-[#6B6480]">
            {t("common.itemCount", { count: order.items.length })}
          </span>
          <span className="text-xs text-[#9D98B3]">
            {formatDate(order.created_at, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </button>

      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={orderActionKey(action)}
              type="button"
              disabled={updating}
              onClick={() => onAction(action)}
              className={[
                "rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50",
                action.kind === "status" && action.status === "canceled"
                  ? "border border-red-200 text-red-600 hover:bg-red-50"
                  : "border border-[#E5E3EE] text-[#6B6480] hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC] hover:text-[#6D4AFF]",
              ].join(" ")}
            >
              {updating
                ? t("common.loadingEllipsis")
                : orderActionLabel(action, t)}
            </button>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-4 rounded-xl border border-[#E5E3EE] bg-[#F4F3F8]/60 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
            {t("orders.orderItems")}
          </p>
          <div className="space-y-2">
            {order.items.map((item, i) => (
              <OrderItemRow
                key={i}
                item={item}
                skuLookup={skuLookup}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[#E5E3EE] pt-3 text-sm font-bold text-[#1C1B1F]">
            <span>{t("orders.orderTotal")}</span>
            <span>{formatCents(order.total_cents)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderRows({
  order,
  skuLookup,
  expanded,
  updating,
  onToggle,
  onAction,
}: {
  order: Order;
  skuLookup: Map<string, SkuVariantContext>;
  expanded: boolean;
  updating: boolean;
  onToggle: () => void;
  onAction: (action: OrderAction) => void;
}) {
  const { t, formatDate, formatCurrency } = useI18n();
  const actions = ORDER_ACTIONS[order.status] ?? [];

  function formatCents(cents: number) {
    return formatCurrency(cents / 100);
  }

  return (
    <>
      <tr
        className={[
          "border-b border-[#F0EEF8] cursor-pointer transition-colors",
          expanded ? "bg-[#F8F7FC]" : "hover:bg-[#FAFAFA]",
        ].join(" ")}
        onClick={onToggle}
      >
        <td className="px-5 py-3.5">
          <span className="font-mono text-xs font-semibold text-[#1C1B1F]">
            {order.id}
          </span>
        </td>
        <td className="px-5 py-3.5 text-[#1C1B1F]">
          {order.customer_id}
        </td>
        <td className="px-5 py-3.5 text-[#6B6480]">
          {t("common.itemCount", { count: order.items.length })}
        </td>
        <td className="px-5 py-3.5 font-semibold text-[#1C1B1F]">
          {formatCents(order.total_cents)}
        </td>
        <td className="px-5 py-3.5">
          <OrderStatusBadge status={order.status} />
        </td>
        <td className="px-5 py-3.5 text-[#9D98B3] text-xs">
          {formatDate(order.created_at, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </td>
        <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
          {actions.length > 0 && (
            <div className="flex items-center justify-end gap-1">
              {actions.map((action) => (
                <button
                  key={orderActionKey(action)}
                  disabled={updating}
                  onClick={() => onAction(action)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50",
                    action.kind === "status" && action.status === "canceled"
                      ? "border border-red-200 text-red-600 hover:bg-red-50"
                      : "border border-[#E5E3EE] text-[#6B6480] hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC] hover:text-[#6D4AFF]",
                  ].join(" ")}
                >
                  {updating
                    ? t("common.loadingEllipsis")
                    : orderActionLabel(action, t)}
                </button>
              ))}
            </div>
          )}
        </td>
      </tr>

      {/* Expanded order detail */}
      {expanded && (
        <tr className="border-b border-[#F0EEF8] bg-[#F4F3F8]/60">
          <td colSpan={7} className="px-8 py-4">
            <div className="rounded-xl border border-[#E5E3EE] bg-white p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
                {t("orders.orderItems")}
              </p>
              <div className="space-y-2">
                {order.items.map((item, i) => (
                  <OrderItemRow
                    key={i}
                    item={item}
                    skuLookup={skuLookup}
                  />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[#E5E3EE] pt-3 text-sm font-bold text-[#1C1B1F]">
                <span>{t("orders.orderTotal")}</span>
                <span>{formatCents(order.total_cents)}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function OrderItemRow({
  item,
  skuLookup,
}: {
  item: OrderItem;
  skuLookup: Map<string, SkuVariantContext>;
}) {
  const { t, formatCurrency } = useI18n();
  const ctx = skuLookup.get(item.sku);
  const variantLabel = formatOrderItemVariant(item.sku, skuLookup);

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F3F8] text-xs font-bold text-[#6D4AFF]">
          {item.sku.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <span className="block truncate font-mono text-xs font-medium text-[#1C1B1F]">
            {item.sku}
          </span>
          {ctx && (
            <span className="block truncate text-xs text-[#6B6480]">
              {ctx.productName}
              {variantLabel ? ` · ${variantLabel}` : ""}
            </span>
          )}
          <span className="text-[#9D98B3]">
            {t("orders.quantityTimes", { quantity: item.quantity })}
          </span>
        </div>
      </div>
      <span className="shrink-0 font-semibold text-[#1C1B1F]">
        {formatCurrency((item.unit_price_cents * item.quantity) / 100)}
      </span>
    </div>
  );
}
