import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  type ReferralCode,
  ReferralError,
  type ReferralReport,
  type ReferrerStatement,
  bpsToPercentText,
  currentMonthKST,
  getReferralReport,
  isMonth,
  listReferralCodes,
  referralCodePath,
  referralReportCsv,
  shiftMonth,
} from "~/lib/referrals";
import ReferralEditor, { referralBtnCls, referralCardCls } from "~/components/ReferralEditor";
import { expiresOnFromISO } from "~/lib/promotions";
import { useI18n } from "~/lib/i18n";

export function meta() {
  return [{ title: "Referral codes | Dupli1 Admin" }];
}

const cardCls = referralCardCls;
const btnCls = referralBtnCls;

/**
 * Secret referral codes (backend docs/product-referral-codes.md): the codes,
 * and what each referrer is owed for a month. Shoppers see an ordinary code.
 */
export default function Referrals() {
  const { t } = useI18n();
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ status: number; message?: string } | null>(null);
  // null: editor closed; "new": creating; otherwise the code being edited.
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    listReferralCodes()
      .then(setCodes)
      .catch((err) => {
        setCodes([]);
        setLoadError({
          status: err instanceof ReferralError ? err.status : 0,
          message: err instanceof Error ? err.message : undefined,
        });
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  function saved(code: ReferralCode) {
    setCodes((prev) => {
      const next = prev.filter((c) => c.code !== code.code);
      next.push(code);
      return next.sort((a, b) => a.code.localeCompare(b.code));
    });
    setEditing(null);
  }

  const editingCode = editing && editing !== "new" ? codes.find((c) => c.code === editing) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">{t("referrals.title")}</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">{t("referrals.subtitle")}</p>
        </div>
        {editing === null && !loadError && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            {t("referrals.newCode")}
          </button>
        )}
      </div>

      <div className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-fg">
        {t("referrals.secretNote")}
      </div>

      {editing !== null && (
        <ReferralEditor
          key={editing}
          initial={editingCode}
          onCancel={() => setEditing(null)}
          onSaved={saved}
        />
      )}

      <section className={cardCls}>
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">{t("referrals.codesHeading")}</h2>
        </div>
        {loading ? (
          <p className="px-5 py-6 text-sm text-muted">{t("referrals.loading")}</p>
        ) : loadError ? (
          <p className="px-5 py-6 text-sm text-danger-fg">
            {loadError.status === 403
              ? t("referrals.needsPromotionRead")
              : loadError.message || t("referrals.failedToLoad")}
          </p>
        ) : codes.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">{t("referrals.noCodes")}</p>
        ) : (
          <CodesTable codes={codes} onEdit={(code) => setEditing(code)} />
        )}
      </section>

      <CommissionReport />
    </div>
  );
}

function CodesTable({ codes, onEdit }: { codes: ReferralCode[]; onEdit: (code: string) => void }) {
  const { t, formatWon, formatDate } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <th className="px-5 py-3">{t("referrals.colCode")}</th>
            <th className="px-5 py-3">{t("referrals.colReferrer")}</th>
            <th className="px-5 py-3">{t("referrals.colDiscount")}</th>
            <th className="px-5 py-3">{t("referrals.colCommission")}</th>
            <th className="px-5 py-3">{t("referrals.colUses")}</th>
            <th className="px-5 py-3">{t("referrals.colStatus")}</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {codes.map((c) => {
            const expiresOn = expiresOnFromISO(c.expires_at);
            const expired = !!c.expires_at && new Date(c.expires_at).getTime() < Date.now();
            return (
              <tr key={c.code} className="border-b border-edge/60 last:border-0" data-testid="referral-row">
                <td className="px-5 py-3">
                  <Link to={referralCodePath(c.code)} className="font-mono font-semibold text-accent hover:underline">
                    {c.code}
                  </Link>
                </td>
                <td className="px-5 py-3 text-ink">{c.referrer_name}</td>
                <td className="px-5 py-3 text-ink">
                  {c.benefit?.discount_type === "fixed"
                    ? formatWon(c.benefit.discount_fixed_won ?? 0)
                    : `${Math.round((c.benefit?.discount_fraction ?? 0) * 100)}%`}
                </td>
                <td className="px-5 py-3 text-ink">{bpsToPercentText(c.commission_bps)}%</td>
                <td className="px-5 py-3 text-muted">{c.redemption_count}</td>
                <td className="px-5 py-3">
                  {!c.active ? (
                    <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted">{t("referrals.statusOff")}</span>
                  ) : expired ? (
                    <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted">{t("referrals.statusExpired")}</span>
                  ) : (
                    <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-semibold text-success-fg">{t("referrals.statusLive")}</span>
                  )}
                  {expiresOn && (
                    <span className="ml-2 text-xs text-muted">
                      {t("referrals.until", { date: formatDate(`${expiresOn}T12:00:00+09:00`) })}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <button type="button" className={btnCls} onClick={() => onEdit(c.code)}>
                    {t("referrals.edit")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CommissionReport() {
  const { t, formatWon } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("month");
  // Read on the client only, so SSR and hydration agree on the month.
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => setNow(currentMonthKST()), []);
  const month = isMonth(requested) ? requested : now;

  const [report, setReport] = useState<ReferralReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; message?: string } | null>(null);

  useEffect(() => {
    if (!month) return;
    let live = true;
    setLoading(true);
    setError(null);
    getReferralReport(month)
      .then((r) => live && setReport(r))
      .catch((err) => {
        if (!live) return;
        setReport(null);
        setError({
          status: err instanceof ReferralError ? err.status : 0,
          message: err instanceof Error ? err.message : undefined,
        });
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [month]);

  function goTo(next: string) {
    const params = new URLSearchParams(searchParams);
    params.set("month", next);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }

  function download() {
    if (!report) return;
    const blob = new Blob([referralReportCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `referral-commission-${report.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={cardCls} data-testid="commission-report">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">{t("referrals.reportHeading")}</h2>
          <p className="mt-0.5 text-xs text-muted">{t("referrals.reportRules")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={btnCls} disabled={!month} onClick={() => month && goTo(shiftMonth(month, -1))} aria-label={t("referrals.prevMonth")}>
            ←
          </button>
          <input
            type="month"
            aria-label={t("referrals.month")}
            className="rounded-xl border border-edge bg-panel px-3 py-1.5 text-sm text-ink"
            value={month ?? ""}
            onChange={(e) => isMonth(e.target.value) && goTo(e.target.value)}
          />
          <button type="button" className={btnCls} disabled={!month} onClick={() => month && goTo(shiftMonth(month, 1))} aria-label={t("referrals.nextMonth")}>
            →
          </button>
          <button type="button" className={btnCls} disabled={!report || report.totals.orders === 0} onClick={download}>
            {t("referrals.downloadCsv")}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="px-5 py-6 text-sm text-muted">{t("referrals.loading")}</p>
      ) : error ? (
        <p className="px-5 py-6 text-sm text-danger-fg">
          {error.status === 403 ? t("referrals.needsOrderReadAll") : error.message || t("referrals.reportFailed")}
        </p>
      ) : !report || report.referrers.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted" data-testid="report-empty">{t("referrals.reportEmpty")}</p>
      ) : (
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-4" data-testid="report-totals">
            <Tile label={t("referrals.totalCommission")} value={formatWon(report.totals.commission_won)} />
            <Tile label={t("referrals.totalWithholding")} value={formatWon(report.totals.withholding_won)} />
            <Tile label={t("referrals.totalNet")} value={formatWon(report.totals.net_won)} strong />
            <Tile
              label={t("referrals.totalOpen")}
              value={formatWon(report.totals.open_commission_won)}
              hint={t("referrals.openOrders", { count: report.totals.open_orders })}
            />
          </div>
          {report.referrers.map((s) => (
            <Statement key={s.referrer_name} s={s} />
          ))}
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-edge bg-panel px-4 py-3">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className={`mt-1 tabular-nums ${strong ? "text-lg font-bold text-ink" : "text-base font-semibold text-ink"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Statement({ s }: { s: ReferrerStatement }) {
  const { t, formatWon, formatDateTime } = useI18n();
  const when = (iso?: string) =>
    iso ? formatDateTime(iso, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }) : "—";
  return (
    <div className="rounded-xl border border-edge" data-testid="referrer-statement">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge px-4 py-3">
        <div>
          <span className="text-base font-semibold text-ink">{s.referrer_name}</span>
          <span className="ml-2 font-mono text-xs">
            {s.codes.map((code, i) => (
              <span key={code}>
                {i > 0 && <span className="text-muted">, </span>}
                <Link to={referralCodePath(code)} className="text-accent hover:underline">{code}</Link>
              </span>
            ))}
          </span>
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
          <div><dt className="inline text-muted">{t("referrals.orders")} </dt><dd className="inline font-semibold text-ink">{s.orders}</dd></div>
          <div><dt className="inline text-muted">{t("referrals.commission")} </dt><dd className="inline font-semibold text-ink">{formatWon(s.commission_won)}</dd></div>
          <div title={t("referrals.withholdingSplit", { income: formatWon(s.income_tax_won), local: formatWon(s.local_tax_won) })}>
            <dt className="inline text-muted">{t("referrals.withholding")} </dt>
            <dd className="inline font-semibold text-ink">−{formatWon(s.withholding_won)}</dd>
          </div>
          <div><dt className="inline text-muted">{t("referrals.net")} </dt><dd className="inline font-bold text-ink" data-testid="statement-net">{formatWon(s.net_won)}</dd></div>
        </dl>
      </div>
      {s.lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-muted">
                <th className="px-4 py-2">{t("referrals.colOrder")}</th>
                <th className="px-4 py-2">{t("referrals.colFulfilled")}</th>
                <th className="px-4 py-2 text-right">{t("referrals.colGoods")}</th>
                <th className="px-4 py-2 text-right">{t("referrals.colDiscountWon")}</th>
                <th className="px-4 py-2 text-right">{t("referrals.colBase")}</th>
                <th className="px-4 py-2 text-right">{t("referrals.colRate")}</th>
                <th className="px-4 py-2 text-right">{t("referrals.commission")}</th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.order_id} className="border-t border-edge/60 tabular-nums" data-testid="statement-line">
                  <td className="px-4 py-2"><Link to={`/orders/${encodeURIComponent(l.order_id)}`} className="font-mono text-accent hover:underline">{l.order_id}</Link></td>
                  <td className="px-4 py-2 text-muted">{when(l.fulfilled_at)}</td>
                  <td className="px-4 py-2 text-right text-ink">{formatWon(l.subtotal_won)}</td>
                  <td className="px-4 py-2 text-right text-muted">−{formatWon(l.discount_won)}</td>
                  <td className="px-4 py-2 text-right text-ink">{formatWon(l.base_won)}</td>
                  <td className="px-4 py-2 text-right text-muted">{bpsToPercentText(l.commission_bps)}%</td>
                  <td className="px-4 py-2 text-right font-semibold text-ink">{formatWon(l.commission_won)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-edge/60 px-4 py-2 text-xs text-muted">
            {t("referrals.withholdingSplit", { income: formatWon(s.income_tax_won), local: formatWon(s.local_tax_won) })}
          </p>
        </div>
      )}
      {s.open.length > 0 && (
        <details className="border-t border-edge px-4 py-3 text-sm" data-testid="statement-open">
          <summary className="cursor-pointer text-muted">
            {t("referrals.openSummary", { count: s.open_orders, amount: formatWon(s.open_commission_won) })}
          </summary>
          <ul className="mt-2 space-y-1">
            {s.open.map((l) => (
              <li key={l.order_id} className="flex flex-wrap gap-x-4 tabular-nums">
                <Link to={`/orders/${encodeURIComponent(l.order_id)}`} className="font-mono text-accent hover:underline">{l.order_id}</Link>
                <span className="text-muted">{t(`referrals.status_${l.status}`)}</span>
                <span className="text-ink">{formatWon(l.commission_won)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
