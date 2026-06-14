import { useEffect, useState } from "react";
import { type AnalyticsSummary, getAnalytics } from "~/lib/api";

// Backend analytics endpoints not yet implemented — shows placeholder.


export function meta() {
  return [{ title: "Analytics | Schick Admin" }];
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  useEffect(() => {
    getAnalytics()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1C1B1F]">Analytics</h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">Revenue and performance overview</p>
        </div>
        <div className="rounded-2xl border border-[#E5E3EE] bg-white p-12 text-center shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F4F3F8]">
            <svg className="size-6 text-[#9D98B3]" viewBox="0 0 24 24" fill="none">
              <path d="M3 17l4-5 4 3 4-6 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 21h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <p className="font-semibold text-[#1C1B1F]">Analytics not yet available</p>
          <p className="mt-1 text-sm text-[#9D98B3]">
            Analytics endpoints are not yet implemented in the backend.
          </p>
        </div>
      </div>
    );
  }

  const revenue =
    period === "7d"
      ? data.revenue7d
      : period === "30d"
      ? data.revenue30d
      : data.revenue90d;
  const orders =
    period === "7d"
      ? data.orders7d
      : period === "30d"
      ? data.orders30d
      : data.orders30d * 3;
  const aov = orders > 0 ? revenue / orders : 0;

  const maxRevenue = Math.max(...data.topCategories.map((c) => c.revenue));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1C1B1F]">Analytics</h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">
            Revenue and performance overview
          </p>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 rounded-xl border border-[#E5E3EE] bg-white p-1 shadow-[0_1px_3px_rgba(28,27,31,0.04)]">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={[
                "rounded-lg px-4 py-1.5 text-xs font-semibold transition",
                period === p
                  ? "bg-[#6D4AFF] text-white shadow-sm"
                  : "text-[#6B6480] hover:bg-[#F4F3F8]",
              ].join(" ")}
            >
              {p === "7d" ? "7 days" : p === "30d" ? "30 days" : "90 days"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Revenue"
          value={formatCurrency(revenue)}
          icon={<RevenueIcon />}
          color="bg-violet-50 text-violet-600"
          change="+14.2%"
          positive
        />
        <KpiCard
          label="Orders"
          value={String(orders)}
          icon={<OrderIcon />}
          color="bg-blue-50 text-blue-600"
          change="+8.7%"
          positive
        />
        <KpiCard
          label="Avg. order value"
          value={formatCurrency(aov)}
          icon={<AovIcon />}
          color="bg-emerald-50 text-emerald-600"
          change="+5.1%"
          positive
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Category breakdown */}
        <div className="lg:col-span-3 rounded-2xl border border-[#E5E3EE] bg-white p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
          <h2 className="mb-5 font-semibold text-[#1C1B1F]">
            Revenue by category
          </h2>
          <div className="space-y-4">
            {data.topCategories.map((cat) => {
              const pct = (cat.revenue / maxRevenue) * 100;
              return (
                <div key={cat.category}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-[#1C1B1F]">
                      {cat.category}
                    </span>
                    <div className="flex items-center gap-3 text-[#6B6480]">
                      <span className="text-xs">{cat.orders} orders</span>
                      <span className="font-semibold text-[#1C1B1F]">
                        {formatCurrency(cat.revenue)}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#F4F3F8]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#6D4AFF] to-[#A78BFA] transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top products */}
        <div className="lg:col-span-2 rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
          <div className="border-b border-[#E5E3EE] px-5 py-4">
            <h2 className="font-semibold text-[#1C1B1F]">Top products</h2>
          </div>
          <div className="divide-y divide-[#F0EEF8]">
            {data.topProducts.map((product, i) => (
              <div
                key={product.id}
                className="flex items-center gap-3 px-5 py-3.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F4F3F8] text-xs font-bold text-[#6B6480]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#1C1B1F]">
                    {product.name}
                  </p>
                  <p className="text-xs text-[#9D98B3]">
                    {product.sold} sold
                  </p>
                </div>
                <span className="text-sm font-semibold text-[#1C1B1F]">
                  {formatCurrency(product.revenue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary table */}
      <div className="rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)] overflow-hidden">
        <div className="border-b border-[#E5E3EE] px-5 py-4">
          <h2 className="font-semibold text-[#1C1B1F]">Category performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0EEF8] bg-[#FAFAFA]">
                {["Category", "Orders", "Revenue", "Share", "Avg. order"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#9D98B3]"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {data.topCategories.map((cat) => {
                const totalRev = data.topCategories.reduce(
                  (s, c) => s + c.revenue,
                  0
                );
                const share = ((cat.revenue / totalRev) * 100).toFixed(1);
                const avg = cat.orders > 0 ? cat.revenue / cat.orders : 0;
                return (
                  <tr
                    key={cat.category}
                    className="border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]"
                  >
                    <td className="px-5 py-3.5 font-medium text-[#1C1B1F]">
                      {cat.category}
                    </td>
                    <td className="px-5 py-3.5 text-[#6B6480]">
                      {cat.orders}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-[#1C1B1F]">
                      {formatCurrency(cat.revenue)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#F4F3F8]">
                          <div
                            className="h-full rounded-full bg-[#6D4AFF]"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#6B6480]">{share}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[#6B6480]">
                      {formatCurrency(avg)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  color,
  change,
  positive,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  change: string;
  positive: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
      <div className="flex items-start justify-between">
        <div className={`rounded-xl p-2.5 ${color}`}>{icon}</div>
        <span
          className={[
            "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
            positive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700",
          ].join(" ")}
        >
          {positive ? "↑" : "↓"} {change}
        </span>
      </div>
      <div className="mt-4">
        <div className="text-2xl font-bold text-[#1C1B1F]">{value}</div>
        <div className="mt-0.5 text-sm text-[#6B6480]">{label}</div>
      </div>
    </div>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);
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
function AovIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none">
      <path d="M3 17l4-5 4 3 4-6 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 21h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
