import { useEffect, useState } from "react";
import {
  type Promotion,
  type PromotionBenefit,
  createPromotion,
  deletePromotion,
  describeBenefit,
  getPromotions,
  minSpendCondition,
  minSpendOf,
  updatePromotion,
} from "~/lib/api";
import { formatWon } from "~/lib/i18n/format";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "Promotions | Dupli1 Admin" }];
}

const inputCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function Promotions() {
  const { notify } = useNotify();
  const { t, locale } = useI18n();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  // A shared campaign code anyone may use once, or one bound to an account and
  // granted by issue. WELCOME50 is the latter.
  const [scope, setScope] = useState<"global" | "single_user">("global");
  const [ttlDays, setTtlDays] = useState("30");
  // A code gives either a percentage of the cart or a flat won amount. The
  // sign-up campaign is the flat kind, which the pre-Phase-2 form could not
  // express at all.
  const [benefitKind, setBenefitKind] = useState<"percent" | "fixed">("percent");
  const [discountPct, setDiscountPct] = useState("");
  const [discountWon, setDiscountWon] = useState("");
  const [minSpendWon, setMinSpendWon] = useState("");
  const [description, setDescription] = useState("");
  const [terms, setTerms] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  function loadPromotions() {
    setLoading(true);
    setError(null);
    getPromotions()
      .then(setPromotions)
      .catch((err) => {
        setPromotions([]);
        setError(err instanceof Error ? err.message : t("promotions.failedToLoad"));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadPromotions();
  }, []);

  function buildBenefit(): PromotionBenefit | null {
    if (benefitKind === "fixed") {
      const won = Number(discountWon);
      if (!Number.isFinite(won) || won <= 0 || !Number.isInteger(won)) return null;
      return { target: "goods", discount_type: "fixed", discount_fixed_won: won, apply_to: "entire_subtotal" };
    }
    const pct = Number(discountPct);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return null;
    return {
      target: "goods",
      discount_type: "percent",
      // The backend requires a fraction strictly between 0 and 1, so 100% is
      // not expressible — a code cannot make the goods free.
      discount_fraction: pct / 100,
      apply_to: "entire_subtotal",
    };
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const benefit = buildBenefit();
    if (!code.trim() || !benefit) {
      notify(t("promotions.invalidCodeOrDiscount"), "error");
      return;
    }
    const minSpend = minSpendWon.trim() ? Number(minSpendWon) : 0;
    if (minSpendWon.trim() && (!Number.isInteger(minSpend) || minSpend <= 0)) {
      notify(t("promotions.invalidMinSpend"), "error");
      return;
    }

    setCreating(true);
    try {
      const created = await createPromotion({
        code: code.trim(),
        scope,
        // Only meaningful for single_user: how long each issued entitlement
        // lasts, counted from when it is issued rather than from launch.
        entitlement_ttl_days: scope === "single_user" ? Number(ttlDays) || 0 : undefined,
        benefit,
        conditions: minSpend > 0 ? minSpendCondition(minSpend) : undefined,
        description: description.trim() || undefined,
        terms: terms.trim() || undefined,
        // A date here means the end of that day in Seoul; the backend does the
        // conversion so every client agrees on the boundary.
        expires_on: expiresOn.trim() || undefined,
        active: true,
      });
      setPromotions((prev) => [...prev, created]);
      setCode("");
      setScope("global");
      setTtlDays("30");
      setDiscountPct("");
      setDiscountWon("");
      setMinSpendWon("");
      setDescription("");
      setTerms("");
      setExpiresOn("");
      notify(t("promotions.promotionCreated", { code: created.code }));
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("promotions.failedToCreate"),
        "error"
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(promotion: Promotion) {
    setBusyCode(promotion.code);
    try {
      const updated = await updatePromotion(promotion.code, {
        active: !promotion.active,
      });
      setPromotions((prev) =>
        prev.map((c) => (c.code === promotion.code ? updated : c))
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("promotions.failedToUpdate"),
        "error"
      );
    } finally {
      setBusyCode(null);
    }
  }

  async function handleDelete(promotionCode: string) {
    setBusyCode(promotionCode);
    try {
      await deletePromotion(promotionCode);
      setPromotions((prev) => prev.filter((c) => c.code !== promotionCode));
      notify(t("promotions.promotionDeleted", { code: promotionCode }));
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("promotions.failedToDelete"),
        "error"
      );
    } finally {
      setBusyCode(null);
    }
  }

  const headers = [
    t("promotions.colCode"),
    t("promotions.colScope"),
    t("promotions.colDiscount"),
    t("promotions.colMinSpend"),
    t("promotions.colDescription"),
    t("promotions.colExpires"),
    t("promotions.colUsed"),
    t("promotions.colActive"),
    "",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink sm:text-2xl">
          {t("promotions.title")}
        </h1>
        <p className="mt-0.5 text-sm text-muted">{t("promotions.subtitle")}</p>
      </div>

      <form
        onSubmit={handleCreate}
        className="grid gap-4 rounded-2xl border border-edge bg-surface p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:grid-cols-2"
      >
        <Field label={t("promotions.code")} id="code" required>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className={inputCls}
            placeholder={t("promotions.codePlaceholder")}
            required
          />
        </Field>
        <Field label={t("promotions.scope")} id="scope" required>
          <select
            id="scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as "global" | "single_user")}
            className={inputCls}
          >
            <option value="global">{t("promotions.scopeGlobal")}</option>
            <option value="single_user">{t("promotions.scopeSingleUser")}</option>
          </select>
          <p className="text-xs text-faint">
            {scope === "single_user" ? t("promotions.scopeSingleUserHint") : t("promotions.scopeGlobalHint")}
          </p>
        </Field>
        {scope === "single_user" && (
          <Field label={t("promotions.ttlDays")} id="ttlDays">
            <input
              id="ttlDays"
              type="number"
              min="0"
              step="1"
              value={ttlDays}
              onChange={(e) => setTtlDays(e.target.value)}
              className={inputCls}
            />
            <p className="text-xs text-faint">{t("promotions.ttlDaysHint")}</p>
          </Field>
        )}
        <Field label={t("promotions.benefitKind")} id="benefitKind" required>
          <select
            id="benefitKind"
            value={benefitKind}
            onChange={(e) => setBenefitKind(e.target.value as "percent" | "fixed")}
            className={inputCls}
          >
            <option value="percent">{t("promotions.benefitPercent")}</option>
            <option value="fixed">{t("promotions.benefitFixed")}</option>
          </select>
        </Field>
        {benefitKind === "percent" ? (
          <Field label={t("promotions.discountPercent")} id="discount" required>
            <input
              id="discount"
              type="number"
              min="1"
              max="99"
              step="1"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              className={inputCls}
              placeholder={t("promotions.discountPlaceholder")}
              required
            />
          </Field>
        ) : (
          <Field label={t("promotions.discountWon")} id="discountWon" required>
            <input
              id="discountWon"
              type="number"
              min="1"
              step="1"
              value={discountWon}
              onChange={(e) => setDiscountWon(e.target.value)}
              className={inputCls}
              placeholder={t("promotions.discountWonPlaceholder")}
              required
            />
          </Field>
        )}
        <Field label={t("promotions.minSpend")} id="minSpend">
          <input
            id="minSpend"
            type="number"
            min="0"
            step="1"
            value={minSpendWon}
            onChange={(e) => setMinSpendWon(e.target.value)}
            className={inputCls}
            placeholder={t("promotions.minSpendPlaceholder")}
          />
        </Field>
        <Field label={t("promotions.description")} id="description">
          <input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
            placeholder={t("promotions.descriptionPlaceholder")}
          />
        </Field>
        <Field label={t("promotions.expiresOn")} id="expiresOn">
          <input
            id="expiresOn"
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            className={inputCls}
          />
          <p className="text-xs text-faint">{t("promotions.expiresOnHint")}</p>
        </Field>
        <Field label={t("promotions.terms")} id="terms">
          <input
            id="terms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            className={inputCls}
            placeholder={t("promotions.termsPlaceholder")}
          />
        </Field>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={creating}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {creating ? t("promotions.creating") : t("promotions.createPromotion")}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-edge bg-surface shadow-[0_1px_4px_rgba(28,27,31,0.04)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : promotions.length === 0 ? (
          <div className="px-5 py-16 text-center text-faint">
            {t("promotions.noPromotionsYet")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge-soft bg-subtle text-left">
                  {headers.map((h, i) => (
                    <th
                      key={h || `actions-${i}`}
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {promotions.map((promotion) => (
                  <tr
                    key={promotion.code}
                    className="border-b border-edge-soft last:border-0 hover:bg-subtle"
                  >
                    <td className="px-5 py-3.5 font-mono font-semibold text-ink">
                      {promotion.code}
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {promotion.scope === "single_user" ? (
                        <span title={t("promotions.scopeSingleUserHint")}>
                          {t("promotions.scopeSingleUserShort")}
                          {promotion.entitlement_ttl_days
                            ? ` · ${t("promotions.ttlDaysShort", { days: String(promotion.entitlement_ttl_days) })}`
                            : ""}
                        </span>
                      ) : (
                        t("promotions.scopeGlobalShort")
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {describeDiscount(promotion, locale)}
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {minSpendOf(promotion.conditions) !== null
                        ? formatWon(locale, minSpendOf(promotion.conditions) as number)
                        : t("common.emptyValue")}
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {promotion.description || t("common.emptyValue")}
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {formatExpiry(promotion, locale) || t("common.emptyValue")}
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {promotion.redemption_count ?? 0}
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        disabled={busyCode === promotion.code}
                        onClick={() => handleToggleActive(promotion)}
                        className={[
                          "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                          promotion.active
                            ? "bg-success-bg text-success-fg"
                            : "bg-page text-faint",
                        ].join(" ")}
                      >
                        {promotion.active
                          ? t("promotions.active")
                          : t("promotions.inactive")}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        disabled={busyCode === promotion.code}
                        onClick={() => handleDelete(promotion.code)}
                        className="text-xs font-semibold text-danger-fg hover:underline disabled:opacity-50"
                      >
                        {t("promotions.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  required,
  children,
}: {
  label: string;
  id: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-muted"
      >
        {label}
        {required && <span className="text-danger-fg"> *</span>}
      </label>
      {children}
    </div>
  );
}

/**
 * Renders the discount a code gives, whichever shape it is, falling back to
 * the legacy fraction for rows written before Phase 2.
 */
function describeDiscount(promotion: Promotion, locale: Parameters<typeof formatWon>[0]): string {
  const benefit = describeBenefit(promotion);
  if (benefit.discount_type === "fixed" && benefit.discount_fixed_won) {
    return formatWon(locale, benefit.discount_fixed_won);
  }
  if (benefit.discount_fraction) {
    return `${Math.round(benefit.discount_fraction * 100)}%`;
  }
  return "";
}

/**
 * Shows the enforced expiry as the Seoul date it means. The legacy free-text
 * column is displayed only when there is no real expiry, and is marked so an
 * operator does not mistake it for something the backend enforces — it never
 * was.
 */
function formatExpiry(promotion: Promotion, locale: string): string {
  if (promotion.expires_at) {
    return new Date(promotion.expires_at).toLocaleDateString(locale, { timeZone: "Asia/Seoul" });
  }
  return promotion.expires ? `${promotion.expires} (not enforced)` : "";
}
