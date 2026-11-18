import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  adjustCustomerPoints,
  getCustomerPoints,
  listCustomerPointEntries,
  type PointEntry,
  PointsError,
  type PointsSummary,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

/**
 * A customer's points (적립금): balance, pending, expiring, VIP tier and the
 * history, plus a manager adjustment behind a review step. Backend
 * docs/payment-points.md. The console does not know the operator's
 * permissions, so a 403 from payment is what says "not allowed here".
 */

const REASON_MAX = 200;
const PAGE = 20;

const inputCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";

function formatPoints(n: number): string {
  return Math.abs(n).toLocaleString("en-US");
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `adj-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CustomerPointsPanel({
  customerId,
  email,
}: {
  customerId: string;
  email: string;
}) {
  const { t } = useI18n();
  const [summary, setSummary] = useState<PointsSummary | null>(null);
  const [entries, setEntries] = useState<PointEntry[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ forbidden?: boolean; message?: string } | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCustomerPoints(customerId, PAGE)
      .then((s) => {
        if (cancelled) return;
        setSummary(s);
        setEntries(s.entries ?? []);
        setCursor(s.next_cursor);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof PointsError && err.status === 403) {
          setError({ forbidden: true });
        } else {
          setError({ message: err instanceof Error ? err.message : undefined });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await listCustomerPointEntries(customerId, cursor, PAGE);
      setEntries((prev) => [...prev, ...page.entries]);
      setCursor(page.next_cursor);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : undefined });
    } finally {
      setLoadingMore(false);
    }
  }

  function applied(next: PointsSummary) {
    setSummary(next);
    setEntries(next.entries ?? []);
    setCursor(next.next_cursor);
    setAdjusting(false);
  }

  if (loading) {
    return <p className="text-sm text-muted">{t("customerPoints.loading")}</p>;
  }
  if (error || !summary) {
    return (
      <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg">
        {error?.forbidden
          ? t("customerPoints.noReadPermission")
          : (error?.message ?? t("customerPoints.failed"))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SummaryTiles summary={summary} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{t("customerPoints.history")}</h2>
        {!adjusting && (
          <button
            type="button"
            onClick={() => setAdjusting(true)}
            className="rounded-full border border-edge bg-surface px-4 py-1.5 text-sm font-medium text-ink transition hover:border-accent/40"
          >
            {t("customerPoints.adjust")}
          </button>
        )}
      </div>

      {adjusting && (
        <AdjustForm
          customerId={customerId}
          email={email}
          balance={summary.balance}
          onCancel={() => setAdjusting(false)}
          onApplied={applied}
        />
      )}

      <HistoryTable entries={entries} />

      {cursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="rounded-full border border-edge bg-surface px-4 py-1.5 text-sm font-medium text-muted transition hover:border-accent/40 disabled:opacity-50"
        >
          {loadingMore ? t("customerPoints.loading") : t("customerPoints.loadMore")}
        </button>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-edge bg-panel px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

function SummaryTiles({ summary }: { summary: PointsSummary }) {
  const { t, formatWon, formatDate } = useI18n();
  const tier = summary.tier;
  const tierName = (code: string) => t(`customerPoints.tier_${code}`);
  const rate = (multiplier: number) => (multiplier / 10).toString();
  const next = tier.next;
  const progress = next
    ? Math.min(
        100,
        Math.round(
          ((tier.spend_won - tier.min_spend_won) /
            Math.max(1, next.min_spend_won - tier.min_spend_won)) *
            100
        )
      )
    : 100;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label={t("customerPoints.balance")}
        value={t("customerPoints.pointsValue", { points: formatPoints(summary.balance) })}
      />
      <Tile
        label={t("customerPoints.pending")}
        value={t("customerPoints.pointsValue", { points: formatPoints(summary.pending) })}
        hint={t("customerPoints.pendingHint")}
      />
      <Tile
        label={t("customerPoints.expiring")}
        value={t("customerPoints.pointsValue", { points: formatPoints(summary.expiring) })}
        hint={
          summary.expiring > 0
            ? t("customerPoints.expiringBy", { date: formatDate(summary.expiring_by) })
            : undefined
        }
      />
      <div className="rounded-xl border border-edge bg-panel px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {t("customerPoints.tier")}
        </p>
        <p className="mt-1 flex items-baseline gap-2 text-xl font-bold text-ink">
          {tierName(tier.code)}
          <span className="text-xs font-medium text-muted">
            {t("customerPoints.tierRate", { rate: rate(tier.multiplier) })}
          </span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-edge-soft">
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1 text-xs text-faint">
          {t("customerPoints.tierSpend", { spend: formatWon(tier.spend_won) })}
        </p>
        <p className="text-xs text-faint">
          {next
            ? t("customerPoints.tierNext", {
                amount: formatWon(Math.max(0, next.min_spend_won - tier.spend_won)),
                tier: tierName(next.code),
              })
            : t("customerPoints.tierTop")}
        </p>
      </div>
    </div>
  );
}

function HistoryTable({ entries }: { entries: PointEntry[] }) {
  const { t, formatDateTime } = useI18n();
  if (entries.length === 0) {
    return <p className="text-sm text-muted">{t("customerPoints.empty")}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-edge">
      <table className="min-w-full text-sm">
        <thead className="bg-panel text-left text-xs font-medium uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5">{t("customerPoints.colDate")}</th>
            <th className="px-4 py-2.5">{t("customerPoints.colType")}</th>
            <th className="px-4 py-2.5 text-right">{t("customerPoints.colPoints")}</th>
            <th className="px-4 py-2.5">{t("customerPoints.colDetail")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge-soft">
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                {formatDateTime(e.created_at)}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-ink">
                {t(`customerPoints.kind_${e.kind}`)}
              </td>
              <td
                className={[
                  "whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums",
                  e.points >= 0 ? "text-success-fg" : "text-danger-fg",
                ].join(" ")}
              >
                {e.points >= 0 ? "+" : "−"}
                {t("customerPoints.pointsValue", { points: formatPoints(e.points) })}
              </td>
              <td className="px-4 py-2.5 text-muted">
                {e.order_id ? (
                  <Link
                    to={`/orders/${encodeURIComponent(e.order_id)}`}
                    className="font-mono text-accent hover:underline"
                  >
                    {e.order_id}
                  </Link>
                ) : (
                  (e.note ?? "")
                )}
                {e.order_id && e.note ? <span className="ml-2">{e.note}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdjustForm({
  customerId,
  email,
  balance,
  onCancel,
  onApplied,
}: {
  customerId: string;
  email: string;
  balance: number;
  onCancel: () => void;
  onApplied: (summary: PointsSummary) => void;
}) {
  const { t } = useI18n();
  const { notify } = useNotify();
  const [direction, setDirection] = useState<"give" | "take">("give");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // One key per reviewed adjustment, so a retried confirm lands once.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const points = Number(amount);
  const validAmount = /^\d+$/.test(amount) && points > 0;

  function review() {
    if (!validAmount) return setFormError(t("customerPoints.amountInvalid"));
    if (!reason.trim()) return setFormError(t("customerPoints.reasonRequired"));
    if (direction === "take" && points > balance) {
      return setFormError(t("customerPoints.insufficient", { balance: formatPoints(balance) }));
    }
    setFormError(null);
    setIdempotencyKey(newIdempotencyKey());
    setReviewing(true);
  }

  async function confirm() {
    setSaving(true);
    setFormError(null);
    try {
      const next = await adjustCustomerPoints(
        customerId,
        direction === "give" ? points : -points,
        reason.trim(),
        idempotencyKey
      );
      notify(t("customerPoints.saved", { balance: formatPoints(next.balance) }), "success");
      onApplied(next);
    } catch (err) {
      if (err instanceof PointsError && err.status === 403) {
        setFormError(t("customerPoints.noManagePermission"));
      } else if (err instanceof PointsError && err.reason === "insufficient_points") {
        setFormError(t("customerPoints.insufficient", { balance: formatPoints(balance) }));
      } else {
        setFormError(err instanceof Error ? err.message : t("customerPoints.failed"));
      }
      setReviewing(false);
    } finally {
      setSaving(false);
    }
  }

  const toggleCls = (active: boolean) =>
    [
      "rounded-full px-4 py-1.5 text-sm font-medium transition",
      active
        ? "bg-accent text-white"
        : "border border-edge bg-surface text-muted hover:border-accent/40",
    ].join(" ");

  return (
    <div className="space-y-4 rounded-xl border border-edge bg-panel p-4 sm:p-5">
      <h3 className="text-base font-semibold text-ink">{t("customerPoints.adjustTitle")}</h3>

      {reviewing ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink">
            {t(direction === "give" ? "customerPoints.confirmGive" : "customerPoints.confirmTake", {
              points: formatPoints(points),
              email,
            })}
          </p>
          <p className="text-sm text-muted">
            {t("customerPoints.confirmReason", { reason: reason.trim() })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={saving}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition disabled:opacity-50"
            >
              {t("customerPoints.confirmButton")}
            </button>
            <button
              type="button"
              onClick={() => setReviewing(false)}
              disabled={saving}
              className="rounded-full border border-edge bg-surface px-4 py-1.5 text-sm font-medium text-muted"
            >
              {t("customerPoints.back")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button type="button" className={toggleCls(direction === "give")} onClick={() => setDirection("give")}>
              {t("customerPoints.give")}
            </button>
            <button type="button" className={toggleCls(direction === "take")} onClick={() => setDirection("take")}>
              {t("customerPoints.take")}
            </button>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted">{t("customerPoints.amount")}</span>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              className={`${inputCls} max-w-xs`}
              placeholder="5000"
            />
          </label>
          <label className="block space-y-1">
            <span className="flex justify-between text-xs font-medium text-muted">
              {t("customerPoints.reason")}
              <span className="text-faint">
                {t("customerPoints.reasonCount", { count: String(reason.length) })}
              </span>
            </span>
            <input
              value={reason}
              maxLength={REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              className={inputCls}
              placeholder={t("customerPoints.reasonPlaceholder")}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={review}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition"
            >
              {t("customerPoints.review")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-edge bg-surface px-4 py-1.5 text-sm font-medium text-muted"
            >
              {t("customerPoints.cancel")}
            </button>
          </div>
        </div>
      )}

      {formError && (
        <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg">{formError}</div>
      )}
    </div>
  );
}
