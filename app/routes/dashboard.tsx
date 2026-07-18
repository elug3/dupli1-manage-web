import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  type Order,
  type Product,
  type VariantStockAlert,
  getCatalogStockAlerts,
  getOrders,
  getProducts,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";

export function meta() {
  return [{ title: "Dashboard | Dupli1 Admin" }];
}

export default function Dashboard() {
  const { t } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [stockAlerts, setStockAlerts] = useState<VariantStockAlert[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const failures: string[] = [];
    const capture = <T,>(label: string, fallback: T) => (err: unknown) => {
      failures.push(
        t("dashboard.errorWithLabel", {
          label,
          message: err instanceof Error ? err.message : t("common.requestFailed"),
        })
      );
      return fallback;
    };

    Promise.all([
      getProducts().catch(
        capture(t("dashboard.errorLabelProducts"), [] as Product[])
      ),
      getCatalogStockAlerts().catch(
        capture(t("dashboard.errorLabelStockAlerts"), [] as VariantStockAlert[])
      ),
      getOrders()
        .catch(capture(t("dashboard.errorLabelOrders"), [] as Order[]))
        .then((o) => o.slice(0, 5)),
    ]).then(([prods, alerts, orders]) => {
      setProducts(prods);
      setStockAlerts(alerts);
      setRecentOrders(orders);
      setErrors(failures);
      setLoading(false);
    });
  }, [t]);

  return (
    <div className="space-y-8">
      <PageHeader />
      {errors.length > 0 && (
        <div className="space-y-1 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      <StatsGrid products={products} loading={loading} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentOrdersTable orders={recentOrders} />
        </div>
        <QuickPanel stockAlerts={stockAlerts} />
      </div>
    </div>
  );
}

function PageHeader() {
  const { t, formatDate } = useI18n();
  const formatted = formatDate(new Date(), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">
          {t("dashboard.title")}
        </h1>
        <p className="mt-0.5 text-sm text-[#6B6480]">{formatted}</p>
      </div>
      <Link
        to="/orders"
        className="w-full rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-[#5A38E8] active:scale-[0.98] sm:w-auto"
      >
        {t("dashboard.viewAllOrders")}
      </Link>
    </div>
  );
}

function StatsGrid({
  products,
  loading,
}: {
  products: Product[];
  loading: boolean;
}) {
  const { t } = useI18n();
  const active = products.length;

  const cards: {
    label: string;
    value: string;
    sub: string | null;
    icon: React.ReactNode;
    color: string;
    to?: string;
  }[] = [
    {
      label: t("dashboard.revenueToday"),
      value: t("common.emptyValue"),
      sub: t("dashboard.analyticsNotYetAvailable"),
      icon: <RevenueIcon />,
      color: "bg-violet-50 text-violet-600",
    },
    {
      label: t("dashboard.ordersToday"),
      value: t("common.emptyValue"),
      sub: t("dashboard.analyticsNotYetAvailable"),
      icon: <OrderIcon />,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: t("dashboard.catalogItems"),
      value: loading ? t("common.loadingEllipsis") : String(active),
      sub: loading ? null : t("dashboard.parentProductsStyles"),
      icon: <BoxIcon />,
      color: "bg-emerald-50 text-emerald-600",
      to: "/products",
    },
    {
      label: t("dashboard.pendingOrders"),
      value: t("common.emptyValue"),
      sub: t("dashboard.analyticsNotYetAvailable"),
      icon: <ClockIcon />,
      color: "bg-amber-50 text-amber-600",
    },
  ];

  const cardClass =
    "rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]";

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const inner = (
          <>
            <div className="flex items-start justify-between">
              <div className={`rounded-xl p-2.5 ${card.color}`}>{card.icon}</div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-[#1C1B1F]">{card.value}</div>
              <div className="mt-0.5 text-sm font-medium text-[#6B6480]">
                {card.label}
              </div>
              {card.sub && (
                <div className="mt-1 text-xs text-[#9D98B3]">{card.sub}</div>
              )}
            </div>
          </>
        );

        if (card.to) {
          return (
            <Link
              key={card.label}
              to={card.to}
              className={`${cardClass} block transition hover:border-[#6D4AFF]/40 hover:bg-[#FAFAFA] active:scale-[0.99]`}
            >
              {inner}
            </Link>
          );
        }

        return (
          <div key={card.label} className={cardClass}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function RecentOrdersTable({ orders }: { orders: Order[] }) {
  const { t, formatCents, formatDate } = useI18n();
  const headers = [
    t("dashboard.colOrder"),
    t("dashboard.colCustomer"),
    t("dashboard.colTotal"),
    t("dashboard.colStatus"),
    t("dashboard.colDate"),
  ];

  return (
    <div className="rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
      <div className="flex items-center justify-between border-b border-[#E5E3EE] px-5 py-4">
        <h2 className="font-semibold text-[#1C1B1F]">
          {t("dashboard.recentOrders")}
        </h2>
        <Link
          to="/orders"
          className="text-xs font-medium text-[#6D4AFF] hover:underline"
        >
          {t("dashboard.viewAllArrow")}
        </Link>
      </div>
      <div className="overflow-x-auto md:overflow-visible">
        <table className="hidden w-full text-sm md:table">
          <thead>
            <tr className="border-b border-[#F0EEF8] text-left">
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[#9D98B3]">
                  {t("dashboard.noOrdersYet")}
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]"
                >
                  <td className="px-5 py-3.5 font-mono text-xs font-medium text-[#1C1B1F]">
                    {order.id}
                  </td>
                  <td className="px-5 py-3.5 text-[#1C1B1F]">
                    {order.customer_id}
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-[#1C1B1F]">
                    {formatCents(order.total_cents)}
                  </td>
                  <td className="px-5 py-3.5">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-5 py-3.5 text-[#9D98B3]">
                    {formatDate(order.created_at, {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[#F0EEF8] md:hidden">
        {orders.length === 0 ? (
          <div className="px-4 py-10 text-center text-[#9D98B3]">
            {t("dashboard.noOrdersYet")}
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="space-y-2 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-medium text-[#1C1B1F]">
                    {order.id}
                  </p>
                  <p className="mt-1 text-sm text-[#6B6480]">{order.customer_id}</p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-[#1C1B1F]">
                  {formatCents(order.total_cents)}
                </span>
                <span className="text-[#9D98B3]">
                  {formatDate(order.created_at, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function QuickPanel({ stockAlerts }: { stockAlerts: VariantStockAlert[] }) {
  const { t } = useI18n();
  const outOfStock = stockAlerts.filter((row) => row.quantity === 0);
  const lowStock = stockAlerts.filter(
    (row) => row.quantity > 0 && row.quantity <= 5
  );

  function alertLabel(row: VariantStockAlert): string {
    const option = [row.color, row.size].filter(Boolean).join(" / ");
    return option ? `${row.parentName} (${option})` : row.parentName;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
        <h2 className="mb-3 font-semibold text-[#1C1B1F]">
          {t("dashboard.quickActions")}
        </h2>
        <div className="space-y-2">
          <Link
            to="/products"
            className="flex items-center gap-3 rounded-xl border border-[#E5E3EE] px-4 py-3 text-sm font-medium text-[#1C1B1F] transition hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC]"
          >
            <span className="rounded-lg bg-violet-50 p-1.5 text-violet-600">
              <PlusIcon />
            </span>
            {t("dashboard.browseCatalog")}
          </Link>
          <Link
            to="/orders"
            className="flex items-center gap-3 rounded-xl border border-[#E5E3EE] px-4 py-3 text-sm font-medium text-[#1C1B1F] transition hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC]"
          >
            <span className="rounded-lg bg-blue-50 p-1.5 text-blue-600">
              <FulfillIcon />
            </span>
            {t("dashboard.fulfilPendingOrders")}
          </Link>
          <Link
            to="/analytics"
            className="flex items-center gap-3 rounded-xl border border-[#E5E3EE] px-4 py-3 text-sm font-medium text-[#1C1B1F] transition hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC]"
          >
            <span className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600">
              <ChartIcon />
            </span>
            {t("dashboard.viewAnalytics")}
          </Link>
        </div>
      </div>

      {(outOfStock.length > 0 || lowStock.length > 0) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-amber-900">
            <span className="text-amber-500">⚠</span> {t("dashboard.stockAlerts")}
          </h2>
          <p className="mb-3 text-xs text-amber-800/80">
            {t("dashboard.stockAlertsHint")}
          </p>
          <div className="space-y-2">
            {outOfStock.map((row) => (
              <Link
                key={row.sku}
                to={`/products/${encodeURIComponent(row.parentId)}`}
                className="flex items-center justify-between gap-2 text-sm hover:underline"
              >
                <span className="truncate text-amber-900">{alertLabel(row)}</span>
                <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  {t("dashboard.outOfStock")}
                </span>
              </Link>
            ))}
            {lowStock.map((row) => (
              <Link
                key={row.sku}
                to={`/products/${encodeURIComponent(row.parentId)}`}
                className="flex items-center justify-between gap-2 text-sm hover:underline"
              >
                <span className="truncate text-amber-900">{alertLabel(row)}</span>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {t("dashboard.quantityLeft", { count: row.quantity })}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OrderStatusBadge({ status }: { status: Order["status"] }) {
  const { t } = useI18n();
  const map: Record<Order["status"], { label: string; class: string }> = {
    pending: {
      label: t("common.orderStatusPending"),
      class: "bg-amber-100 text-amber-800",
    },
    paid: {
      label: t("common.orderStatusPaid"),
      class: "bg-blue-100 text-blue-800",
    },
    in_transit: {
      label: t("common.orderStatusInTransit"),
      class: "bg-violet-100 text-violet-800",
    },
    fulfilled: {
      label: t("common.orderStatusFulfilled"),
      class: "bg-emerald-100 text-emerald-800",
    },
    canceled: {
      label: t("common.orderStatusCanceled"),
      class: "bg-slate-100 text-slate-600",
    },
  };
  const { label, class: cls } = map[status] ?? {
    label: status,
    class: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function RevenueIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function OrderIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6zM3 6h18M16 10a4 4 0 01-8 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none">
      <path d="M12 2l9 4.5V17L12 21.5 3 17V6.5L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 2v19.5M3 6.5l9 4.5 9-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function FulfillIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M3 17l4-5 4 3 4-6 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
