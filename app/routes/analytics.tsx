import { useEffect, useState } from "react";
import { type AnalyticsSummary, getAnalytics } from "~/lib/api";
import { useI18n } from "~/lib/i18n";

export function meta() {
  return [{ title: "Analytics | Dupli1 Admin" }];
}

export default function Analytics() {
  const { t, formatCents } = useI18n();
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"7d" | "30d">("30d");

  useEffect(() => {
    setError(null);
    getAnalytics()
      .then(setData)
      .catch((err) => {
        setData(null);
        setError(
          err instanceof Error ? err.message : t("analytics.failedToLoad")
        );
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">
            {t("analytics.title")}
          </h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">
            {t("analytics.subtitleFromOrders")}
          </p>
        </div>
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">
            {t("analytics.title")}
          </h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">
            {t("analytics.subtitleFromOrders")}
          </p>
        </div>
        <div className="rounded-2xl border border-[#E5E3EE] bg-white p-12 text-center shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
          <p className="font-semibold text-[#1C1B1F]">
            {t("analytics.noOrderDataYet")}
          </p>
          <p className="mt-1 text-sm text-[#9D98B3]">
            {t("analytics.noOrderDataHint")}
          </p>
        </div>
      </div>
    );
  }

  const revenueCents = period === "7d" ? data.revenue7d : data.revenue30d;
  const orders = period === "7d" ? data.orders7d : data.orders30d;
  const aovCents = orders > 0 ? revenueCents / orders : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">
            {t("analytics.title")}
          </h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">
            {t("analytics.subtitleFromTotals")}
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
              {p === "7d"
                ? t("analytics.period7Days")
                : t("analytics.period30Days")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={t("analytics.kpiRevenue")}
          value={formatCents(revenueCents)}
        />
        <KpiCard label={t("analytics.kpiOrders")} value={String(orders)} />
        <KpiCard
          label={t("analytics.kpiAvgOrderValue")}
          value={formatCents(aovCents)}
        />
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
