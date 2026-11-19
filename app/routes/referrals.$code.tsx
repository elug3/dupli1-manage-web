import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  type ReferralCode,
  type ReferralCodeHistory,
  ReferralError,
  type ReferralLine,
  type ReferralOrderFilter,
  bpsToPercentText,
  buildReferralInput,
  currentMonthKST,
  filterReferralOrders,
  getReferralCodeHistory,
  isReferralOrderFilter,
  listReferralCodes,
  referralCodeOrdersCsv,
  referralOrderKind,
  referralToForm,
  updateReferralCode,
} from "~/lib/referrals";
import ReferralEditor, { referralBtnCls, referralCardCls } from "~/components/ReferralEditor";
import { expiresOnFromISO } from "~/lib/promotions";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export function meta({ params }: { params: { code?: string } }) {
  return [{ title: `${params.code ?? "Referral code"} | Referral codes | Dupli1 Admin` }];
}

const cardCls = referralCardCls;
const btnCls = referralBtnCls;
const primaryBtnCls =
  "rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60";
const secondaryBtnCls =
  "rounded-xl border border-edge bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-subtle disabled:opacity-60";
const PAGE = 20;

type LoadError = { status: number; message?: string };

function loadError(err: unknown): LoadError {
  return {
    status: err instanceof ReferralError ? err.status : 0,
    message: err instanceof Error ? err.message : undefined,
  };
}

/**
 * One secret referral code (backend docs/product-referral-codes.md): its
 * settings, what it sold, the commission it earned per month and every paid
 * order placed with it. The settings and the orders come from different
 * services and permissions (`promotion.read`, `order.read.all`), so each part
 * loads and fails on its own.
 */
export default function ReferralCodeDetail() {
  const { t } = useI18n();
  const { notify } = useNotify();
  const code = (useParams().code ?? "").toUpperCase();

  const [promo, setPromo] = useState<ReferralCode | null>(null);
  const [promoLoading, setPromoLoading] = useState(true);
  const [promoError, setPromoError] = useState<LoadError | null>(null);
  const [history, setHistory] = useState<ReferralCodeHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<LoadError | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [toggling, setToggling] = useState(false);

  const loadPromo = useCallback(() => {
    setPromoLoading(true);
    setPromoError(null);
    // Product has no GET by code, so read the list the codes page reads.
    listReferralCodes()
      .then((codes) => setPromo(codes.find((c) => c.code === code) ?? null))
      .catch((err) => {
        setPromo(null);
        setPromoError(loadError(err));
      })
      .finally(() => setPromoLoading(false));
  }, [code]);

  useEffect(loadPromo, [loadPromo]);
  useEffect(() => {
    let live = true;
    setHistoryLoading(true);
    setHistoryError(null);
    getReferralCodeHistory(code)
      .then((h) => live && setHistory(h))
      .catch((err) => {
        if (!live) return;
        setHistory(null);
        setHistoryError(loadError(err));
      })
      .finally(() => live && setHistoryLoading(false));
    return () => {
      live = false;
    };
  }, [code]);

  async function setActive(active: boolean) {
    if (!promo) return;
    const built = buildReferralInput({ ...referralToForm(promo), active }, { create: false });
    if (!built.input) {
      notify(t(built.errorKey ?? "referrals.failedToSave"));
      return;
    }
    setToggling(true);
    try {
      const saved = await updateReferralCode(promo.code, built.input);
      setPromo(saved);
      setConfirmOff(false);
      notify(t(active ? "referrals.turnedOnNotice" : "referrals.turnedOffNotice", { code: saved.code }));
    } catch (err) {
      notify(err instanceof Error ? err.message : t("referrals.failedToSave"));
    } finally {
      setToggling(false);
    }
  }

  const notFound = !promoLoading && !promoError && !promo;

  return (
    <div className="space-y-6" data-testid="referral-detail">
      <nav className="flex items-center gap-1.5 text-sm">
        <Link to="/referrals" className="font-semibold text-accent hover:underline">
          ← {t("referrals.detailBack")}
        </Link>
        <span className="text-faint">/</span>
        <span className="font-mono text-muted">{code}</span>
      </nav>

      <Header
        code={code}
        promo={promo}
        history={history}
        actions={
          promo && !editing ? (
            <div className="flex gap-2">
              {promo.active ? (
                <button type="button" className={secondaryBtnCls} onClick={() => setConfirmOff(true)} disabled={toggling}>
                  {t("referrals.turnOff")}
                </button>
              ) : (
                <button type="button" className={secondaryBtnCls} onClick={() => setActive(true)} disabled={toggling}>
                  {t("referrals.turnOn")}
                </button>
              )}
              <button type="button" className={primaryBtnCls} onClick={() => setEditing(true)}>
                {t("referrals.editButton")}
              </button>
            </div>
          ) : null
        }
      />

      {confirmOff && promo && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-fg" role="alert" data-testid="turn-off-confirm">
          <span className="flex-1">{t("referrals.turnOffConfirm", { code: promo.code })}</span>
          <button type="button" className={primaryBtnCls} onClick={() => setActive(false)} disabled={toggling}>
            {t("referrals.turnOff")}
          </button>
          <button type="button" className={secondaryBtnCls} onClick={() => setConfirmOff(false)}>
            {t("referrals.cancel")}
          </button>
        </div>
      )}

      {editing && promo && (
        <ReferralEditor
          initial={promo}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setPromo(saved);
            setEditing(false);
          }}
        />
      )}

      {promoError && (
        <p className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          {promoError.status === 403 ? t("referrals.needsPromotionRead") : promoError.message || t("referrals.failedToLoad")}
        </p>
      )}
      {notFound && (
        <p className="rounded-xl bg-subtle px-4 py-3 text-sm text-muted" data-testid="referral-not-found">
          {t("referrals.detailNotFound", { code })}
        </p>
      )}

      {historyLoading ? (
        <p className="text-sm text-muted">{t("referrals.loading")}</p>
      ) : historyError ? (
        <p className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          {historyError.status === 403 ? t("referrals.needsOrderReadAll") : historyError.message || t("referrals.historyFailed")}
        </p>
      ) : history ? (
        <Stats history={history} promo={promo} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        {promo ? <SettingsCard promo={promo} /> : <div className="hidden lg:block" />}
        {history && <MonthsCard history={history} />}
      </div>

      {history && <OrdersCard history={history} />}
    </div>
  );
}

function Header({
  code,
  promo,
  history,
  actions,
}: {
  code: string;
  promo: ReferralCode | null;
  history: ReferralCodeHistory | null;
  actions: React.ReactNode;
}) {
  const { t, formatDateTime } = useI18n();
  const day = (iso?: string) =>
    iso ? formatDateTime(iso, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }) : "";
  const orders = history?.orders ?? [];
  const last = orders[0]?.paid_at;
  const first = orders[orders.length - 1]?.paid_at;
  const referrer = promo?.referrer_name ?? history?.referrer_names[history.referrer_names.length - 1] ?? "";
  const earlierNames = (history?.referrer_names ?? []).filter((n) => n !== referrer);
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-mono text-2xl font-bold text-ink sm:text-3xl">{code}</h1>
          {promo && <StatusBadge promo={promo} />}
          <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted">{t("referrals.secretBadge")}</span>
        </div>
        <p className="text-sm text-muted">
          {referrer && (
            <>
              {t("referrals.referrerLabel")} <span className="font-semibold text-ink">{referrer}</span>
              {" · "}
            </>
          )}
          {history && (first ? `${t("referrals.firstOrder", { date: day(first) })} · ${t("referrals.lastOrder", { date: day(last) })}` : t("referrals.noOrdersYet"))}
        </p>
        {earlierNames.length > 0 && (
          <p className="text-xs text-muted">{t("referrals.renamedNote", { names: earlierNames.join(", ") })}</p>
        )}
      </div>
      {actions}
    </div>
  );
}

function StatusBadge({ promo }: { promo: ReferralCode }) {
  const { t } = useI18n();
  const expired = !!promo.expires_at && new Date(promo.expires_at).getTime() < Date.now();
  if (!promo.active || expired) {
    return (
      <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted" data-testid="code-status">
        {t(!promo.active ? "referrals.statusOff" : "referrals.statusExpired")}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-semibold text-success-fg" data-testid="code-status">
      {t("referrals.statusLive")}
    </span>
  );
}

function discountText(promo: ReferralCode, t: ReturnType<typeof useI18n>["t"], formatWon: (n: number) => string) {
  return promo.benefit?.discount_type === "fixed"
    ? t("referrals.discountFixed", { amount: formatWon(promo.benefit.discount_fixed_won ?? 0) })
    : t("referrals.discountPercent", { percent: Math.round((promo.benefit?.discount_fraction ?? 0) * 100) });
}

function Stats({ history, promo }: { history: ReferralCodeHistory; promo: ReferralCode | null }) {
  const { t, formatWon } = useI18n();
  const s = history.summary;
  const tiles: { label: string; value: string; hint: string }[] = [
    {
      label: t("referrals.statOrders"),
      value: String(s.orders),
      hint: t("referrals.statOrdersHint", { fulfilled: s.fulfilled_orders, open: s.open_orders, canceled: s.canceled_orders }),
    },
    { label: t("referrals.statCustomers"), value: String(s.customers), hint: t("referrals.statCustomersHint") },
    { label: t("referrals.statSales"), value: formatWon(s.subtotal_won), hint: t("referrals.statSalesHint") },
    {
      label: t("referrals.statDiscount"),
      value: formatWon(s.discount_won),
      hint: promo ? discountText(promo, t, formatWon) : "",
    },
    {
      label: t("referrals.statEarned"),
      value: formatWon(s.commission_won),
      hint:
        s.open_orders > 0
          ? t("referrals.statEarnedHint", { count: s.open_orders, amount: formatWon(s.open_commission_won) })
          : t("referrals.statEarnedHintNone"),
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" data-testid="code-stats">
      {tiles.map((tile) => (
        <div key={tile.label} className={`${cardCls} px-5 py-4`} data-testid="code-stat">
          <div className="text-xs font-semibold text-muted">{tile.label}</div>
          <div className="mt-1 whitespace-nowrap text-xl font-bold tabular-nums text-ink 2xl:text-2xl">{tile.value}</div>
          {tile.hint && <div className="mt-1 text-xs text-muted">{tile.hint}</div>}
        </div>
      ))}
    </div>
  );
}

function CardHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-edge px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function SettingsCard({ promo }: { promo: ReferralCode }) {
  const { t, formatWon, formatDate } = useI18n();
  const expiresOn = expiresOnFromISO(promo.expires_at);
  const rows: [string, React.ReactNode][] = [
    [t("referrals.colCode"), <span className="font-mono">{promo.code}</span>],
    [t("referrals.colReferrer"), promo.referrer_name],
    [t("referrals.colDiscount"), discountText(promo, t, formatWon)],
    [t("referrals.colCommission"), t("referrals.commissionValue", { percent: bpsToPercentText(promo.commission_bps) })],
    [t("referrals.setUses"), t("referrals.usesValue")],
    [t("referrals.setCombines"), t("referrals.combinesValue")],
    [t("referrals.setValidUntil"), expiresOn ? formatDate(`${expiresOn}T12:00:00+09:00`) : t("referrals.noExpiry")],
    [t("referrals.colStatus"), <StatusBadge promo={promo} />],
  ];
  return (
    <section className={cardCls} data-testid="code-settings">
      <CardHeader title={t("referrals.settingsHeading")} sub={t("referrals.settingsSub")} />
      <dl className="px-5 py-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 border-b border-edge/60 py-2.5 last:border-0">
            <dt className="w-28 shrink-0 text-muted">{k}</dt>
            <dd className="min-w-0 flex-1 font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function MonthsCard({ history }: { history: ReferralCodeHistory }) {
  const { t, formatWon } = useI18n();
  // Read on the client only, so SSR and hydration agree.
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => setNow(currentMonthKST()), []);
  const total = history.months.reduce(
    (acc, m) => ({
      orders: acc.orders + m.orders,
      base: acc.base + m.base_won,
      commission: acc.commission + m.commission_won,
      withheld: acc.withheld + m.withholding_won,
      net: acc.net + m.net_won,
    }),
    { orders: 0, base: 0, commission: 0, withheld: 0, net: 0 }
  );
  const th = "px-4 py-2.5 text-right";
  return (
    <section className={cardCls} data-testid="code-months">
      <CardHeader title={t("referrals.reportHeading")} sub={t("referrals.monthsSub")} />
      {history.months.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">{t("referrals.monthsEmpty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm tabular-nums [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <thead>
              <tr className="bg-panel text-left text-xs font-semibold text-muted">
                <th className="px-5 py-2.5">{t("referrals.colMonth")}</th>
                <th className={th}>{t("referrals.colOrders")}</th>
                <th className={th}>{t("referrals.colBase")}</th>
                <th className={th}>{t("referrals.commission")}</th>
                <th className={th}>{t("referrals.colWithheld")}</th>
                <th className="px-5 py-2.5 text-right">{t("referrals.colNet")}</th>
              </tr>
            </thead>
            <tbody>
              {history.months.map((m) => (
                <tr key={m.month} className="border-t border-edge/60" data-testid="code-month">
                  <td className="px-5 py-3 font-semibold">
                    <Link
                      to={`/referrals?month=${m.month}`}
                      className="text-accent hover:underline"
                      title={t("referrals.statementLink")}
                    >
                      {m.month}
                    </Link>
                    {m.month === now && (
                      <span className="ml-2 rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-fg">{t("referrals.soFar")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-ink">{m.orders}</td>
                  <td className="px-4 py-3 text-right text-ink">{formatWon(m.base_won)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{formatWon(m.commission_won)}</td>
                  <td
                    className="px-4 py-3 text-right text-muted"
                    title={t("referrals.withholdingSplit", { income: formatWon(m.income_tax_won), local: formatWon(m.local_tax_won) })}
                  >
                    −{formatWon(m.withholding_won)}
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-ink" data-testid="code-month-net">{formatWon(m.net_won)}</td>
                </tr>
              ))}
              <tr className="border-t border-edge bg-panel">
                <td className="px-5 py-3 font-semibold text-ink">{t("referrals.allTime")}</td>
                <td className="px-4 py-3 text-right font-semibold text-ink">{total.orders}</td>
                <td className="px-4 py-3 text-right font-semibold text-ink">{formatWon(total.base)}</td>
                <td className="px-4 py-3 text-right font-bold text-ink">{formatWon(total.commission)}</td>
                <td className="px-4 py-3 text-right text-muted">−{formatWon(total.withheld)}</td>
                <td className="px-5 py-3 text-right font-bold text-ink">{formatWon(total.net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-edge/60 px-5 py-3 text-xs text-muted">{t("referrals.payoutNote")}</p>
    </section>
  );
}

const statusTone: Record<string, string> = {
  fulfilled: "bg-success-bg text-success-fg",
  canceled: "bg-danger-bg text-danger-fg",
  in_transit: "bg-warn-bg text-warn-fg",
  delivered: "bg-warn-bg text-warn-fg",
  disputed: "bg-danger-bg text-danger-fg",
};

function OrdersCard({ history }: { history: ReferralCodeHistory }) {
  const { t, formatWon, formatDateTime } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const shown = searchParams.get("show");
  const filter: ReferralOrderFilter = isReferralOrderFilter(shown) ? shown : "all";
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [filter]);

  const s = history.summary;
  const counts: Record<ReferralOrderFilter, number> = {
    all: s.orders,
    fulfilled: s.fulfilled_orders,
    open: s.open_orders,
    canceled: s.canceled_orders,
  };
  const labels: Record<ReferralOrderFilter, string> = {
    all: "referrals.filterAll",
    fulfilled: "referrals.filterFulfilled",
    open: "referrals.filterOpen",
    canceled: "referrals.filterCanceled",
  };
  const lines = filterReferralOrders(history.orders, filter);
  const day = (iso?: string) =>
    iso ? formatDateTime(iso, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }) : "—";

  function choose(next: ReferralOrderFilter) {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("show");
    else params.set("show", next);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }

  function download() {
    const blob = new Blob([referralCodeOrdersCsv(history)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `referral-${history.code}-orders.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const th = "px-4 py-2.5 text-right";
  return (
    <section className={cardCls} data-testid="code-orders">
      <CardHeader title={t("referrals.orders")} sub={t("referrals.ordersSub", { code: history.code })}>
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {(Object.keys(labels) as ReferralOrderFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => choose(f)}
              className={
                filter === f
                  ? "rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white"
                  : "rounded-full border border-edge bg-subtle px-3 py-1 text-xs font-semibold text-muted hover:text-ink"
              }
            >
              {t(labels[f], { count: counts[f] })}
            </button>
          ))}
        </div>
        <button type="button" className={btnCls} disabled={history.orders.length === 0} onClick={download}>
          {t("referrals.downloadCsv")}
        </button>
      </CardHeader>
      {lines.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">
          {history.orders.length === 0 ? t("referrals.ordersEmpty") : t("referrals.ordersEmptyFilter")}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm tabular-nums [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead>
                <tr className="bg-panel text-left text-xs font-semibold text-muted">
                  <th className="px-5 py-2.5">{t("referrals.colOrder")}</th>
                  <th className="px-4 py-2.5">{t("referrals.colCustomer")}</th>
                  <th className="px-4 py-2.5">{t("referrals.colPaid")}</th>
                  <th className="px-4 py-2.5">{t("referrals.colStatus")}</th>
                  <th className="px-4 py-2.5">{t("referrals.colFulfilled")}</th>
                  <th className={th}>{t("referrals.colGoods")}</th>
                  <th className={th}>{t("referrals.colDiscountWon")}</th>
                  <th className={th}>{t("referrals.colBase")}</th>
                  <th className="px-5 py-2.5 text-right">{t("referrals.commission")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.slice(0, limit).map((l) => (
                  <OrderRow key={l.order_id} l={l} day={day} formatWon={formatWon} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-edge/60 px-5 py-3 text-xs">
            <span className="text-muted">{t("referrals.showing", { shown: Math.min(limit, lines.length), total: lines.length })}</span>
            {limit < lines.length && (
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setLimit((n) => n + PAGE)}>
                {t("referrals.loadMore")}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function OrderRow({ l, day, formatWon }: { l: ReferralLine; day: (iso?: string) => string; formatWon: (n: number) => string }) {
  const { t } = useI18n();
  const kind = referralOrderKind(l.status);
  const canceled = kind === "canceled";
  return (
    <tr className="border-t border-edge/60" data-testid="code-order" data-kind={kind ?? ""}>
      <td className="px-5 py-3">
        <Link to={`/orders/${encodeURIComponent(l.order_id)}`} className="font-mono font-semibold text-accent hover:underline">
          {l.order_id}
        </Link>
      </td>
      <td className="px-4 py-3">
        <Link to={`/users/${encodeURIComponent(l.customer_id)}`} className="font-mono text-accent hover:underline">
          {l.customer_id}
        </Link>
      </td>
      <td className="px-4 py-3 text-muted">{day(l.paid_at)}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[l.status] ?? "bg-edge-soft text-accent"}`}>
          {t(`referrals.status_${l.status}`)}
        </span>
      </td>
      <td className="px-4 py-3 text-muted">{day(l.fulfilled_at)}</td>
      <td className={`px-4 py-3 text-right ${canceled ? "text-faint line-through" : "text-ink"}`}>{formatWon(l.subtotal_won)}</td>
      <td className={`px-4 py-3 text-right text-muted ${canceled ? "line-through" : ""}`}>−{formatWon(l.discount_won)}</td>
      <td className={`px-4 py-3 text-right ${canceled ? "text-faint" : "text-ink"}`}>{canceled ? "—" : formatWon(l.base_won)}</td>
      <td className="px-5 py-3 text-right">
        <div className={kind === "fulfilled" ? "font-bold text-ink" : "text-faint"} data-testid="code-order-commission">
          {formatWon(canceled ? 0 : l.commission_won)}
        </div>
        <div className={`text-[11px] ${kind === "fulfilled" ? "text-success-fg" : "text-faint"}`}>
          {t(kind === "fulfilled" ? "referrals.earned" : canceled ? "referrals.refunded" : "referrals.whenFulfilled")}
        </div>
      </td>
    </tr>
  );
}
