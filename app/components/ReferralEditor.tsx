import { useState } from "react";
import {
  REFERRER_NAME_MAX,
  type ReferralCode,
  type ReferralFormState,
  buildReferralInput,
  createReferralCode,
  emptyReferralForm,
  referralToForm,
  updateReferralCode,
} from "~/lib/referrals";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export const referralInputCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";
export const referralCardCls =
  "rounded-2xl border border-edge bg-surface shadow-[0_1px_4px_rgba(28,27,31,0.04)]";
export const referralBtnCls =
  "rounded-xl border border-edge px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-subtle disabled:opacity-50";
const inputCls = referralInputCls;
const cardCls = referralCardCls;
const labelCls = "mb-1.5 block text-xs font-semibold text-muted";

/**
 * Create or edit a secret referral code (backend docs/product-referral-codes.md).
 * Used by /referrals and a code's detail page.
 */
export default function ReferralEditor({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: ReferralCode;
  onCancel: () => void;
  onSaved: (code: ReferralCode) => void;
}) {
  const { t } = useI18n();
  const { notify } = useNotify();
  const create = !initial;
  const [form, setForm] = useState<ReferralFormState>(() => (initial ? referralToForm(initial) : emptyReferralForm()));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ReferralFormState>(key: K, value: ReferralFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const built = buildReferralInput(form, { create });
    if (!built.input) {
      setError(t(built.errorKey ?? "referrals.failedToSave"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const result = create
        ? await createReferralCode(built.input)
        : await updateReferralCode(initial.code, built.input);
      notify(create ? t("referrals.createdNotice", { code: result.code }) : t("referrals.savedNotice", { code: result.code }));
      onSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("referrals.failedToSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className={`${cardCls} space-y-5 p-6`} data-testid="referral-editor">
      <h2 className="text-sm font-semibold text-ink">
        {create ? t("referrals.newCode") : t("referrals.editCode", { code: initial.code })}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="ref-code">{t("referrals.fieldCode")}</label>
          <input
            id="ref-code"
            className={`${inputCls} font-mono uppercase`}
            value={form.code}
            disabled={!create}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
            placeholder="HUH15"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-muted">{t("referrals.fieldCodeHint")}</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="ref-referrer">{t("referrals.fieldReferrer")}</label>
          <input
            id="ref-referrer"
            className={inputCls}
            value={form.referrerName}
            maxLength={REFERRER_NAME_MAX}
            onChange={(e) => set("referrerName", e.target.value)}
            placeholder="허경호"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-muted">{t("referrals.fieldReferrerHint")}</p>
        </div>
        <div>
          <span className={labelCls}>{t("referrals.fieldDiscount")}</span>
          <div className="flex gap-2">
            <select
              aria-label={t("referrals.fieldDiscountType")}
              className="w-20 shrink-0 rounded-xl border border-edge bg-panel px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={form.discountType}
              onChange={(e) => set("discountType", e.target.value as ReferralFormState["discountType"])}
            >
              <option value="percent">%</option>
              <option value="fixed">₩</option>
            </select>
            {form.discountType === "percent" ? (
              <input
                id="ref-percent"
                aria-label={t("referrals.fieldPercent")}
                className={inputCls}
                inputMode="numeric"
                value={form.percent}
                onChange={(e) => set("percent", e.target.value)}
              />
            ) : (
              <input
                id="ref-fixed"
                aria-label={t("referrals.fieldFixed")}
                className={inputCls}
                inputMode="numeric"
                value={form.fixedWon}
                onChange={(e) => set("fixedWon", e.target.value)}
              />
            )}
          </div>
          <p className="mt-1 text-xs text-muted">{t("referrals.fieldDiscountHint")}</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="ref-commission">{t("referrals.fieldCommission")}</label>
          <div className="flex items-center gap-2">
            <input
              id="ref-commission"
              className={inputCls}
              inputMode="decimal"
              value={form.commissionPercent}
              onChange={(e) => set("commissionPercent", e.target.value)}
            />
            <span className="text-sm text-muted">%</span>
          </div>
          <p className="mt-1 text-xs text-muted">{t("referrals.fieldCommissionHint")}</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="ref-expires">{t("referrals.fieldExpires")}</label>
          <input
            id="ref-expires"
            type="date"
            className={inputCls}
            value={form.expiresOn}
            onChange={(e) => set("expiresOn", e.target.value)}
          />
          <p className="mt-1 text-xs text-muted">{t("referrals.fieldExpiresHint")}</p>
        </div>
        <label className="flex items-center gap-2 self-center text-sm text-ink">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          {t("referrals.fieldActive")}
        </label>
      </div>
      <p className="text-xs text-muted">{t("referrals.rulesNote")}</p>
      {error && <p className="text-sm text-danger-fg" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? t("referrals.saving") : create ? t("referrals.create") : t("referrals.save")}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-edge px-4 py-2.5 text-sm font-semibold text-ink hover:bg-subtle">
          {t("referrals.cancel")}
        </button>
      </div>
    </form>
  );
}
