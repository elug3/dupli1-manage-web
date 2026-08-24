import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { type Order, type OrderStatus, getOrders } from "~/lib/api";
import { useI18n } from "~/lib/i18n";

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

export default function Orders() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setError(null);
    getOrders()
      .then(setOrders)
      .catch((err) =>
        setError(err instanceof Error ? err.message : t("orders.failedToLoad"))
      )
      .finally(() => setLoading(false));
  }, [t]);

  const q = search.trim().toLowerCase();
  const filtered = orders.filter((o) => {
    if (activeTab !== "all" && o.status !== activeTab) return false;
    if (!q) return true;
    return (
      o.id.toLowerCase().includes(q) ||
      o.customer_id.toLowerCase().includes(q) ||
      (o.recipient_name?.toLowerCase().includes(q) ?? false)
    );
  });

  const counts = orders.reduce(
    (acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<OrderStatus, number>
  );

  const statusTabLabel = (value: OrderStatus | "all"): string => {
    switch (value) {
      case "all": return t("orders.tabAll");
      case "pending": return t("orders.tabPending");
      case "paid": return t("orders.tabPaid");
      case "in_transit": return t("orders.tabInTransit");
      case "fulfilled": return t("orders.tabFulfilled");
      case "canceled": return t("orders.tabCanceled");
      default: return value;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">
          {t("orders.title")}
        </h1>
        <p className="mt-0.5 text-sm text-[#6B6480]">
          {t("orders.ordersTotal", { count: orders.length })}
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9D98B3]"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="11"
            cy="11"
            r="8"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="m21 21-4.35-4.35"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("orders.searchPlaceholder")}
          className="w-full rounded-xl border border-[#E5E3EE] bg-white py-2.5 pl-9 pr-4 text-sm text-[#1C1B1F] placeholder:text-[#9D98B3] focus:border-[#6D4AFF] focus:outline-none focus:ring-1 focus:ring-[#6D4AFF]/30"
        />
      </div>

      {/* Status tabs */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex w-max max-w-full flex-wrap gap-1 rounded-xl border border-[#E5E3EE] bg-white p-1 shadow-[0_1px_3px_rgba(28,27,31,0.04)] sm:w-fit">
          {STATUS_TAB_VALUES.map((value) => {
            const count =
              value === "all" ? orders.length : (counts[value] ?? 0);
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
      <div className="overflow-hidden rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-[#9D98B3]">
            {q ? t("orders.noMatchingOrders") : t("orders.noOrdersInStatus")}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="divide-y divide-[#F0EEF8] md:hidden">
              {filtered.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F0EEF8] bg-[#FAFAFA]">
                    {(
                      [
                        t("orders.colOrderId"),
                        t("orders.colCustomer"),
                        t("orders.colItems"),
                        t("orders.colTotal"),
                        t("orders.colStatus"),
                        t("orders.colDate"),
                      ] as const
                    ).map((label) => (
                      <th
                        key={label}
                        className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#9D98B3]"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => (
                    <OrderRow key={order.id} order={order} />
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

function OrderCard({ order }: { order: Order }) {
  const { t, formatCents, formatDate } = useI18n();
  return (
    <Link
      to={`/orders/${encodeURIComponent(order.id)}`}
      className="block p-4 transition hover:bg-[#FAFAFA] active:bg-[#F4F3F8]"
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
    </Link>
  );
}

function OrderRow({ order }: { order: Order }) {
  const { t, formatCents, formatDate } = useI18n();
  const navigate = useNavigate();
  return (
    <tr
      className="cursor-pointer border-b border-[#F0EEF8] transition-colors last:border-0 hover:bg-[#FAFAFA]"
      onClick={() => navigate(`/orders/${encodeURIComponent(order.id)}`)}
    >
      <td className="px-5 py-3.5">
        <span className="font-mono text-xs font-semibold text-[#1C1B1F]">
          {order.id}
        </span>
      </td>
      <td className="px-5 py-3.5 text-[#1C1B1F]">{order.customer_id}</td>
      <td className="px-5 py-3.5 text-[#6B6480]">
        {t("common.itemCount", { count: order.items.length })}
      </td>
      <td className="px-5 py-3.5 font-semibold text-[#1C1B1F]">
        {formatCents(order.total_cents)}
      </td>
      <td className="px-5 py-3.5">
        <OrderStatusBadge status={order.status} />
      </td>
      <td className="px-5 py-3.5 text-xs text-[#9D98B3]">
        {formatDate(order.created_at, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </td>
    </tr>
  );
}
