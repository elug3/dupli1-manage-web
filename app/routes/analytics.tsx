import { useEffect, useState } from "react";
import { ReportBarChart } from "~/components/ReportBarChart";
import {
  type RegistrationReport,
  type ReportGranularity,
  type SalesPeriod,
  type SalesReport,
  type VisitorReport,
  conversionRate,
  getRegistrationReport,
  getSalesReport,
  getVisitorReport,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";

export function meta() {
  return [{ title: "Analytics | Dupli1 Admin" }];
}

// Each report loads on its own: one the operator may not read (403 → null)
// or one that fails must not blank the other.
type Loaded<T> =
  | { state: "loading" }
  | { state: "ready"; data: T | null }
  | { state: "error"; message?: string };

/** Today in KST, YYYY-MM-DD — reports are bucketed in Korea time. */
function todayKST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date()
  );
}

/** A report date as a local calendar date, so no timezone shifts the day. */
function localDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export default function Analytics() {
  const { t, formatWon, formatDate } = useI18n();
  const [granularity, setGranularity] = useState<ReportGranularity>("week");
  const [sales, setSales] = useState<Loaded<SalesReport>>({ state: "loading" });
  const [signups, setSignups] = useState<Loaded<RegistrationReport>>({
    state: "loading",
  });
  const [visitors, setVisitors] = useState<Loaded<VisitorReport>>({
    state: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    setSales({ state: "loading" });
    setSignups({ state: "loading" });
    setVisitors({ state: "loading" });
    getSalesReport(granularity)
      .then((data) => !cancelled && setSales({ state: "ready", data }))
      .catch(
        (err) =>
          !cancelled &&
          setSales({
            state: "error",
            message: err instanceof Error ? err.message : undefined,
          })
      );
    getRegistrationReport(granularity)
      .then((data) => !cancelled && setSignups({ state: "ready", data }))
      .catch(
        (err) =>
          !cancelled &&
          setSignups({
            state: "error",
            message: err instanceof Error ? err.message : undefined,
          })
      );
    getVisitorReport(granularity)
      .then((data) => !cancelled && setVisitors({ state: "ready", data }))
      .catch(
        (err) =>
          !cancelled &&
          setVisitors({
            state: "error",
            message: err instanceof Error ? err.message : undefined,
          })
      );
    return () => {
      cancelled = true;
    };
  }, [granularity]);

  const today = todayKST();
  const isWeek = granularity === "week";

  const axisLabel = (start: string) =>
    formatDate(
      localDate(start),
      isWeek ? { month: "numeric", day: "numeric" } : { month: "short" }
    );
  const periodTitle = (start: string, end: string) =>
    isWeek
      ? `${formatDate(localDate(start), { month: "short", day: "numeric" })} – ${formatDate(localDate(end), { month: "short", day: "numeric" })}`
      : formatDate(localDate(start), { year: "numeric", month: "long" });

  // KPIs compare the last finished period with the one before it; the
  // running period is in the chart and table, marked as in progress.
  const finished = <P extends { period_end: string }>(periods: P[]) =>
    periods.filter((p) => p.period_end < today);
  const salesDone =
    sales.state === "ready" && sales.data ? finished(sales.data.periods) : [];
  const signupDone =
    signups.state === "ready" && signups.data
      ? finished(signups.data.periods)
      : [];
  const lastSales = salesDone.at(-1);
  const prevSales = salesDone.at(-2);
  const lastSignup = signupDone.at(-1);
  const prevSignup = signupDone.at(-2);
  const visitorDone =
    visitors.state === "ready" && visitors.data
      ? finished(visitors.data.periods)
      : [];
  const lastVisitors = visitorDone.at(-1);
  const prevVisitors = visitorDone.at(-2);

  // Conversion pairs the two reports by period_start; both use the same KST
  // periods, so a period missing from either simply has no rate.
  const salesByStart = new Map(
    sales.state === "ready" && sales.data
      ? sales.data.periods.map((p) => [p.period_start, p] as const)
      : []
  );
  const conversionFor = (start: string, uniqueVisitors: number) => {
    const s = salesByStart.get(start);
    return s ? conversionRate(s.orders, uniqueVisitors) : null;
  };
  const lastConversion = lastVisitors
    ? conversionFor(lastVisitors.period_start, lastVisitors.unique_visitors)
    : null;
  const prevConversion = prevVisitors
    ? conversionFor(prevVisitors.period_start, prevVisitors.unique_visitors)
    : null;
  const formatPct = (v: number | null) =>
    v === null ? t("common.emptyValue") : `${v.toFixed(1)}%`;

  const changeLabel = (current: number, previous: number | undefined) => {
    if (previous === undefined) return t("analytics.noPrevious");
    const pct = percentChange(current, previous);
    if (pct === null) return t("analytics.noPrevious");
    const sign = pct > 0 ? "+" : "";
    return t(isWeek ? "analytics.vsPreviousWeek" : "analytics.vsPreviousMonth", {
      change: `${sign}${pct.toFixed(0)}%`,
    });
  };

  // A rate moves in percentage points; "+20%" of 1.5% would read as 21.5%.
  const pointChangeLabel = (current: number, previous: number | null) => {
    if (previous === null) return t("analytics.noPrevious");
    const diff = current - previous;
    const sign = diff > 0 ? "+" : "";
    return t(isWeek ? "analytics.vsPreviousWeek" : "analytics.vsPreviousMonth", {
      change: t("analytics.percentPoints", { value: `${sign}${diff.toFixed(1)}` }),
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">
            {t("analytics.title")}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{t("analytics.subtitle")}</p>
        </div>
        <div className="flex gap-1 self-start rounded-xl border border-edge bg-surface p-1 shadow-[0_1px_3px_rgba(28,27,31,0.04)]">
          {(["week", "month"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              aria-pressed={granularity === g}
              className={[
                "rounded-lg px-4 py-1.5 text-xs font-semibold transition",
                granularity === g
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted hover:bg-page",
              ].join(" ")}
            >
              {g === "week" ? t("analytics.weekly") : t("analytics.monthly")}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          {isWeek ? t("analytics.lastWeek") : t("analytics.lastMonth")}
          {lastSales
            ? ` · ${periodTitle(lastSales.period_start, lastSales.period_end)}`
            : ""}
        </p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <KpiCard
            label={t("analytics.kpiNetSales")}
            value={lastSales ? formatWon(lastSales.net_won) : t("common.emptyValue")}
            sub={lastSales ? changeLabel(lastSales.net_won, prevSales?.net_won) : null}
          />
          <KpiCard
            label={t("analytics.kpiPaidOrders")}
            value={lastSales ? String(lastSales.orders) : t("common.emptyValue")}
            sub={lastSales ? changeLabel(lastSales.orders, prevSales?.orders) : null}
          />
          <KpiCard
            label={t("analytics.kpiAvgOrderValue")}
            value={
              lastSales ? formatWon(lastSales.average_order_won) : t("common.emptyValue")
            }
            sub={
              lastSales
                ? changeLabel(lastSales.average_order_won, prevSales?.average_order_won)
                : null
            }
          />
          <KpiCard
            label={t("analytics.kpiNewCustomers")}
            value={
              lastSignup ? String(lastSignup.new_customers) : t("common.emptyValue")
            }
            sub={
              lastSignup
                ? changeLabel(lastSignup.new_customers, prevSignup?.new_customers)
                : null
            }
          />
          <KpiCard
            label={t("analytics.kpiVisitors")}
            value={
              lastVisitors ? String(lastVisitors.unique_visitors) : t("common.emptyValue")
            }
            sub={
              lastVisitors
                ? changeLabel(lastVisitors.unique_visitors, prevVisitors?.unique_visitors)
                : null
            }
          />
          <KpiCard
            label={t("analytics.kpiConversion")}
            value={formatPct(lastConversion)}
            sub={
              lastConversion !== null ? pointChangeLabel(lastConversion, prevConversion) : null
            }
          />
        </div>
      </div>

      <Section title={t("analytics.salesTitle")} note={t("analytics.salesNote")}>
        {sales.state === "loading" && <Spinner />}
        {sales.state === "error" && (
          <ErrorBox message={sales.message ?? t("analytics.failedToLoad")} />
        )}
        {sales.state === "ready" && !sales.data && (
          <p className="text-sm text-muted">{t("analytics.salesNoPermission")}</p>
        )}
        {sales.state === "ready" && sales.data && (
          <>
            <ReportBarChart
              ariaLabel={t("analytics.salesChartLabel")}
              partialNote={t("analytics.inProgress")}
              format={(v) => formatWon(v)}
              points={sales.data.periods.map((p) => ({
                label: axisLabel(p.period_start),
                title: periodTitle(p.period_start, p.period_end),
                value: p.net_won,
                partial: p.period_end >= today,
              }))}
            />
            <SalesTable
              report={sales.data}
              today={today}
              periodTitle={periodTitle}
            />
          </>
        )}
      </Section>

      <Section title={t("analytics.visitorsTitle")} note={t("analytics.visitorsNote")}>
        {visitors.state === "loading" && <Spinner />}
        {visitors.state === "error" && (
          <ErrorBox message={visitors.message ?? t("analytics.failedToLoad")} />
        )}
        {visitors.state === "ready" && !visitors.data && (
          <p className="text-sm text-muted">{t("analytics.visitorsNoPermission")}</p>
        )}
        {visitors.state === "ready" && visitors.data && (
          <>
            <ReportBarChart
              ariaLabel={t("analytics.visitorsChartLabel")}
              partialNote={t("analytics.inProgress")}
              format={(v) => String(v)}
              points={visitors.data.periods.map((p) => ({
                label: axisLabel(p.period_start),
                title: periodTitle(p.period_start, p.period_end),
                value: p.unique_visitors,
                partial: p.period_end >= today,
              }))}
            />
            <p className="mt-3 text-sm text-muted">
              {t("analytics.visitorsToday", {
                count: visitors.data.today.unique_visitors,
              })}
              {" · "}
              {t("analytics.visitorsTotal", {
                count: visitors.data.total_unique_visitors,
              })}
            </p>
            <VisitorTable
              report={visitors.data}
              today={today}
              periodTitle={periodTitle}
              conversionFor={conversionFor}
              ordersFor={(start) => salesByStart.get(start)?.orders ?? null}
              formatPct={formatPct}
            />
          </>
        )}
      </Section>

      <Section
        title={t("analytics.signupsTitle")}
        note={
          signups.state === "ready" && signups.data && signups.data.undated_customers > 0
            ? t("analytics.undatedCustomers", {
                count: signups.data.undated_customers,
              })
            : t("analytics.signupsNote")
        }
      >
        {signups.state === "loading" && <Spinner />}
        {signups.state === "error" && (
          <ErrorBox message={signups.message ?? t("analytics.failedToLoad")} />
        )}
        {signups.state === "ready" && !signups.data && (
          <p className="text-sm text-muted">{t("analytics.signupsNoPermission")}</p>
        )}
        {signups.state === "ready" && signups.data && (
          <>
            <ReportBarChart
              ariaLabel={t("analytics.signupsChartLabel")}
              partialNote={t("analytics.inProgress")}
              format={(v) => String(v)}
              points={signups.data.periods.map((p) => ({
                label: axisLabel(p.period_start),
                title: periodTitle(p.period_start, p.period_end),
                value: p.new_customers,
                partial: p.period_end >= today,
              }))}
            />
            <p className="mt-3 text-sm text-muted">
              {t("analytics.signupsTotal", {
                count: signups.data.total_new_customers,
              })}
            </p>
          </>
        )}
      </Section>
    </div>
  );
}

function SalesTable({
  report,
  today,
  periodTitle,
}: {
  report: SalesReport;
  today: string;
  periodTitle: (start: string, end: string) => string;
}) {
  const { t, formatWon } = useI18n();
  const rows = [...report.periods].reverse();

  const exportCsv = () => {
    const header = [
      "period_start",
      "period_end",
      "orders",
      "gross_won",
      "discount_won",
      "shipping_fee_won",
      "card_surcharge_won",
      "refunds",
      "refunded_won",
      "net_won",
      "average_order_won",
    ];
    const line = (p: SalesPeriod) =>
      [
        p.period_start,
        p.period_end,
        p.orders,
        p.gross_won,
        p.discount_won,
        p.shipping_fee_won,
        p.card_surcharge_won ?? 0,
        p.refunds,
        p.refunded_won,
        p.net_won,
        p.average_order_won,
      ].join(",");
    const csv = [header.join(","), ...report.periods.map(line)].join("\n") + "\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-${report.granularity}-${report.from}-${report.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cells = (p: SalesPeriod) => [
    String(p.orders),
    formatWon(p.gross_won),
    formatWon(p.discount_won),
    formatWon(p.shipping_fee_won),
    formatWon(p.card_surcharge_won ?? 0),
    p.refunds > 0 ? `${formatWon(p.refunded_won)} (${p.refunds})` : formatWon(0),
    formatWon(p.net_won),
    formatWon(p.average_order_won),
  ];
  const columns = [
    t("analytics.colOrders"),
    t("analytics.colGross"),
    t("analytics.colDiscounts"),
    t("analytics.colShipping"),
    t("analytics.colCardSurcharge"),
    t("analytics.colRefunds"),
    t("analytics.colNet"),
    t("analytics.colAvg"),
  ];

  return (
    <div className="mt-6">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-page"
        >
          {t("analytics.exportCsv")}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-xs text-faint">
              <th className="py-2 pr-3 font-medium">{t("analytics.colPeriod")}</th>
              {columns.map((c) => (
                <th key={c} className="py-2 pl-3 text-right font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.period_start} className="border-b border-edge-soft">
                <td className="py-2 pr-3 text-ink">
                  {periodTitle(p.period_start, p.period_end)}
                  {p.period_end >= today && (
                    <span className="ml-2 text-xs text-faint">
                      {t("analytics.inProgress")}
                    </span>
                  )}
                </td>
                {cells(p).map((v, i) => (
                  <td
                    key={columns[i]}
                    className={[
                      "py-2 pl-3 text-right tabular-nums",
                      i === 5 ? "font-semibold text-ink" : "text-muted",
                    ].join(" ")}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-ink">
              <td className="py-2 pr-3 font-semibold">{t("analytics.total")}</td>
              {cells(report.totals).map((v, i) => (
                <td
                  key={columns[i]}
                  className="py-2 pl-3 text-right font-semibold tabular-nums"
                >
                  {v}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function VisitorTable({
  report,
  today,
  periodTitle,
  conversionFor,
  ordersFor,
  formatPct,
}: {
  report: VisitorReport;
  today: string;
  periodTitle: (start: string, end: string) => string;
  conversionFor: (start: string, uniqueVisitors: number) => number | null;
  ordersFor: (start: string) => number | null;
  formatPct: (v: number | null) => string;
}) {
  const { t } = useI18n();
  const rows = [...report.periods].reverse();
  const columns = [
    t("analytics.colVisitors"),
    t("analytics.colVisitorDays"),
    t("analytics.colOrders"),
    t("analytics.colConversion"),
  ];

  return (
    <div className="mt-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-xs text-faint">
              <th className="py-2 pr-3 font-medium">{t("analytics.colPeriod")}</th>
              {columns.map((c) => (
                <th key={c} className="py-2 pl-3 text-right font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const orders = ordersFor(p.period_start);
              const cells = [
                String(p.unique_visitors),
                String(p.visitor_days),
                orders === null ? t("common.emptyValue") : String(orders),
                formatPct(conversionFor(p.period_start, p.unique_visitors)),
              ];
              return (
                <tr key={p.period_start} className="border-b border-edge-soft">
                  <td className="py-2 pr-3 text-ink">
                    {periodTitle(p.period_start, p.period_end)}
                    {p.period_end >= today && (
                      <span className="ml-2 text-xs text-faint">
                        {t("analytics.inProgress")}
                      </span>
                    )}
                  </td>
                  {cells.map((v, i) => (
                    <td
                      key={columns[i]}
                      className={[
                        "py-2 pl-3 text-right tabular-nums",
                        i === 0 ? "font-semibold text-ink" : "text-muted",
                      ].join(" ")}
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-faint">{t("analytics.conversionNote")}</p>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
      <h2 className="font-semibold text-ink">{title}</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted">{note}</p>
      {children}
    </section>
  );
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string | null;
}) {
  return (
    <div className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
      <div className="text-xl font-bold text-ink sm:text-2xl">{value}</div>
      <div className="mt-0.5 text-sm text-muted">{label}</div>
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg">
      {message}
    </div>
  );
}
