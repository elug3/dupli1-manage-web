import { useEffect, useState } from "react";
import { type AnalyticsSummary, getAnalytics } from "~/lib/api";

export function meta() {
  return [{ title: "Analytics | Schick Admin" }];
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7d" | "30d">("30d");

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
          <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">Analytics</h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">
            Derived from order service data
          </p>
        </div>
        <div className="rounded-2xl border border-[#E5E3EE] bg-white p-12 text-center shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
          <p className="font-semibold text-[#1C1B1F]">No order data yet</p>
          <p className="mt-1 text-sm text-[#9D98B3]">
            Analytics are computed from <code className="text-xs">GET /order/api/v1/orders</code>.
          </p>
        </div>
      </div>
    );
  }

  const revenueCents = period === "7d" ? data.revenue7d : data.revenue30d;
  const orders = period === "7d" ? data.orders7d : data.orders30d;
  const revenue = revenueCents / 100;
  const aov = orders > 0 ? revenue / orders : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">Analytics</h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">
            Derived from order service totals
          </p>
        </div>

        <div className="flex gap-1 rounded-xl border border-[#E5E3EE] bg-white p-1 shadow-[0_1px_3px_rgba(28,27,31,0.04)]">
          {(["7d", "30d"] as const).map((p) => (
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
              {p === "7d" ? "7 days" : "30 days"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Revenue" value={formatCurrency(revenue)} />
        <KpiCard label="Orders" value={String(orders)} />
        <KpiCard label="Avg. order value" value={formatCurrency(aov)} />
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
      <div className="text-2xl font-bold text-[#1C1B1F]">{value}</div>
      <div className="mt-0.5 text-sm text-[#6B6480]">{label}</div>
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
