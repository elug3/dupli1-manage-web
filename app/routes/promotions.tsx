import { useEffect, useMemo, useState } from "react";
import {
  type Promotion,
  type PromotionInput,
  createPromotion,
  deletePromotion,
  getPromotions,
  updatePromotion,
} from "~/lib/api";
import {
  CONDITION_ATTRS,
  type ConditionRow,
  type PromotionFormState,
  attrKind,
  buildPromotionInput,
  conditionCount,
  effectiveBenefit,
  emptyPromotionForm,
  isLineAttr,
  isLivePromotion,
  isSetOp,
  opsForKind,
  promotionToForm,
} from "~/lib/promotions";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "Promotional codes | Dupli1 Admin" }];
}

const inputCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function Promotions() {
  const { notify } = useNotify();
  const { t, formatWon } = useI18n();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<PromotionFormState>(emptyPromotionForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const built = buildPromotionInput(form, { includeCode: true });
    if (built.errorKey || !built.input) {
      setFormError(t(built.errorKey ?? "promotions.failedToCreate"));
      return;
    }
    setFormError(null);
    setCreating(true);
    try {
      const created = await createPromotion(built.input);
      setPromotions((prev) => [...prev, created]);
      setForm(emptyPromotionForm());
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
      replaceRow(updated);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("promotions.failedToUpdate"),
        "error"
      );
    } finally {
      setBusyCode(null);
    }
  }

  async function handleSaveEdit(code: string, input: PromotionInput) {
    setBusyCode(code);
    try {
      const updated = await updatePromotion(code, input);
      replaceRow(updated);
      setEditing(null);
      notify(t("promotions.promotionUpdated", { code }));
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
      setPromotions((prev) => prev.filter((p) => p.code !== promotionCode));
      setConfirmingDelete(null);
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

  function replaceRow(updated: Promotion) {
    setPromotions((prev) =>
      prev.map((p) => (p.code === updated.code ? updated : p))
    );
  }

  const headers = [
    t("promotions.colCode"),
    t("promotions.colBenefit"),
    t("promotions.colConditions"),
    t("promotions.colExpiry"),
    t("promotions.colUses"),
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
        className="space-y-5 rounded-2xl border border-edge bg-surface p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]"
      >
        <PromotionFields form={form} onChange={setForm} showCode />
        {formError && (
          <p className="text-sm text-danger-fg">{formError}</p>
        )}
        <button
          type="submit"
          disabled={creating}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
        >
          {creating ? t("promotions.creating") : t("promotions.createPromotion")}
        </button>
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
                  <PromotionRows
                    key={promotion.code}
                    promotion={promotion}
                    busy={busyCode === promotion.code}
                    editing={editing === promotion.code}
                    confirmingDelete={confirmingDelete === promotion.code}
                    onToggleEdit={() =>
                      setEditing((current) =>
                        current === promotion.code ? null : promotion.code
                      )
                    }
                    onToggleActive={() => handleToggleActive(promotion)}
                    onSave={(input) => handleSaveEdit(promotion.code, input)}
                    onAskDelete={() => setConfirmingDelete(promotion.code)}
                    onCancelDelete={() => setConfirmingDelete(null)}
                    onConfirmDelete={() => handleDelete(promotion.code)}
                    formatWon={formatWon}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PromotionRows({
  promotion,
  busy,
  editing,
  confirmingDelete,
  onToggleEdit,
  onToggleActive,
  onSave,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  formatWon,
}: {
  promotion: Promotion;
  busy: boolean;
  editing: boolean;
  confirmingDelete: boolean;
  onToggleEdit: () => void;
  onToggleActive: () => void;
  onSave: (input: PromotionInput) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  formatWon: (amount: number) => string;
}) {
  const { t } = useI18n();
  const live = isLivePromotion(promotion);
  const rules = conditionCount(promotion);

  return (
    <>
      <tr className="border-b border-edge-soft hover:bg-subtle">
        <td className="px-5 py-3.5 font-mono font-semibold text-ink">
          {promotion.code}
          {promotion.scope === "single_user" && (
            <span className="ml-2 rounded-full bg-page px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-faint">
              {t("promotions.scopeSingleUserShort")}
            </span>
          )}
        </td>
        <td className="px-5 py-3.5 text-muted">
          {describeBenefit(promotion, formatWon, t)}
        </td>
        <td className="px-5 py-3.5 text-muted">
          {rules === 0
            ? t("promotions.noRules")
            : t("promotions.ruleCount", { count: rules })}
        </td>
        <td className="px-5 py-3.5 text-muted">
          {promotion.expires_at
            ? formatExpiry(promotion.expires_at)
            : promotion.expires || t("promotions.neverExpires")}
        </td>
        <td className="px-5 py-3.5 text-muted">
          {promotion.redemption_count ?? 0}
          {" / "}
          {promotion.max_redemptions ?? t("promotions.uncapped")}
        </td>
        <td className="px-5 py-3.5">
          <button
            type="button"
            disabled={busy}
            onClick={onToggleActive}
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
        <td className="px-5 py-3.5 text-right whitespace-nowrap">
          <button
            type="button"
            onClick={onToggleEdit}
            className="text-xs font-semibold text-accent hover:underline"
          >
            {editing ? t("promotions.close") : t("promotions.edit")}
          </button>
          {confirmingDelete ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirmDelete}
                className="ml-3 text-xs font-semibold text-danger-fg hover:underline disabled:opacity-50"
              >
                {t("promotions.confirmDelete")}
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                className="ml-3 text-xs font-semibold text-faint hover:underline"
              >
                {t("promotions.cancel")}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onAskDelete}
              className="ml-3 text-xs font-semibold text-danger-fg hover:underline disabled:opacity-50"
            >
              {t("promotions.delete")}
            </button>
          )}
        </td>
      </tr>

      {confirmingDelete && (
        <tr className="border-b border-edge-soft bg-danger-bg/40">
          <td colSpan={7} className="px-5 py-3 text-xs text-danger-fg">
            {live
              ? t("promotions.deleteLiveWarning", {
                  count: promotion.redemption_count ?? 0,
                })
              : t("promotions.deleteWarning")}
          </td>
        </tr>
      )}

      {editing && (
        <tr className="border-b border-edge-soft bg-subtle">
          <td colSpan={7} className="px-5 py-5">
            <EditPanel
              promotion={promotion}
              busy={busy}
              onSave={onSave}
              onCancel={onToggleEdit}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function EditPanel({
  promotion,
  busy,
  onSave,
  onCancel,
}: {
  promotion: Promotion;
  busy: boolean;
  onSave: (input: PromotionInput) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<PromotionFormState>(() =>
    promotionToForm(promotion)
  );
  const [error, setError] = useState<string | null>(null);
  const live = isLivePromotion(promotion);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const built = buildPromotionInput(form, { includeCode: false });
    if (built.errorKey || !built.input) {
      setError(t(built.errorKey ?? "promotions.failedToUpdate"));
      return;
    }
    setError(null);
    onSave(built.input);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {live && (
        <p className="rounded-xl bg-warn-bg px-4 py-3 text-xs text-warn-fg">
          {t("promotions.liveEditWarning", {
            count: promotion.redemption_count ?? 0,
          })}
        </p>
      )}
      <PromotionFields form={form} onChange={setForm} showCode={false} />
      {error && <p className="text-sm text-danger-fg">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? t("common.saving") : t("promotions.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-edge px-5 py-2.5 text-sm font-semibold text-muted transition hover:bg-page"
        >
          {t("promotions.cancel")}
        </button>
      </div>
    </form>
  );
}

function PromotionFields({
  form,
  onChange,
  showCode,
}: {
  form: PromotionFormState;
  onChange: (next: PromotionFormState) => void;
  showCode: boolean;
}) {
  const { t } = useI18n();
  const set = <K extends keyof PromotionFormState>(
    key: K,
    value: PromotionFormState[K]
  ) => onChange({ ...form, [key]: value });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {showCode && (
          <Field label={t("promotions.code")} id="code" required>
            <input
              id="code"
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              className={inputCls}
              placeholder={t("promotions.codePlaceholder")}
              required
            />
          </Field>
        )}
        <Field label={t("promotions.scope")} id="scope">
          <select
            id="scope"
            value={form.scope}
            onChange={(e) =>
              set("scope", e.target.value as PromotionFormState["scope"])
            }
            className={inputCls}
          >
            <option value="global">{t("promotions.scopeGlobal")}</option>
            <option value="single_user">
              {t("promotions.scopeSingleUser")}
            </option>
          </select>
        </Field>

        <Field label={t("promotions.benefitType")} id="benefit-type">
          <select
            id="benefit-type"
            value={form.discountType}
            onChange={(e) =>
              set(
                "discountType",
                e.target.value as PromotionFormState["discountType"]
              )
            }
            className={inputCls}
          >
            <option value="percent">{t("promotions.benefitPercent")}</option>
            <option value="fixed">{t("promotions.benefitFixed")}</option>
          </select>
        </Field>

        {form.discountType === "percent" ? (
          <Field label={t("promotions.discountPercent")} id="percent" required>
            <input
              id="percent"
              type="number"
              min="1"
              max="99"
              step="1"
              value={form.percent}
              onChange={(e) => set("percent", e.target.value)}
              className={inputCls}
              placeholder="30"
            />
          </Field>
        ) : (
          <Field label={t("promotions.discountWon")} id="fixed-won" required>
            <input
              id="fixed-won"
              type="number"
              min="1"
              step="1"
              value={form.fixedWon}
              onChange={(e) => set("fixedWon", e.target.value)}
              className={inputCls}
              placeholder="50000"
            />
          </Field>
        )}

        {form.discountType === "percent" && (
          <Field label={t("promotions.maxDiscountWon")} id="max-discount">
            <input
              id="max-discount"
              type="number"
              min="1"
              step="1"
              value={form.maxDiscountWon}
              onChange={(e) => set("maxDiscountWon", e.target.value)}
              className={inputCls}
              placeholder="20000"
            />
          </Field>
        )}

        <Field label={t("promotions.applyTo")} id="apply-to">
          <select
            id="apply-to"
            value={form.applyTo}
            onChange={(e) =>
              set("applyTo", e.target.value as PromotionFormState["applyTo"])
            }
            className={inputCls}
          >
            <option value="entire_subtotal">
              {t("promotions.applyEntire")}
            </option>
            <option value="eligible_lines">
              {t("promotions.applyEligible")}
            </option>
          </select>
        </Field>

        <Field label={t("promotions.expiresOn")} id="expires-on">
          <input
            id="expires-on"
            type="date"
            value={form.expiresOn}
            onChange={(e) => set("expiresOn", e.target.value)}
            className={inputCls}
          />
          <p className="text-[11px] text-faint">{t("promotions.expiresOnHint")}</p>
        </Field>

        <Field label={t("promotions.maxRedemptions")} id="max-redemptions">
          <input
            id="max-redemptions"
            type="number"
            min="1"
            step="1"
            value={form.maxRedemptions}
            onChange={(e) => set("maxRedemptions", e.target.value)}
            className={inputCls}
            placeholder={t("promotions.uncapped")}
          />
        </Field>

        <Field label={t("promotions.description")} id="description">
          <input
            id="description"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className={inputCls}
            placeholder={t("promotions.descriptionPlaceholder")}
          />
        </Field>

        <Field label={t("promotions.terms")} id="terms">
          <input
            id="terms"
            value={form.terms}
            onChange={(e) => set("terms", e.target.value)}
            className={inputCls}
            placeholder={t("promotions.termsPlaceholder")}
          />
        </Field>
      </div>

      <ConditionsEditor form={form} onChange={onChange} />
    </div>
  );
}

function ConditionsEditor({
  form,
  onChange,
}: {
  form: PromotionFormState;
  onChange: (next: PromotionFormState) => void;
}) {
  const { t } = useI18n();
  const hasLinePredicate = useMemo(
    () => form.conditions.some((row) => isLineAttr(row.attr)),
    [form.conditions]
  );
  function setRow(index: number, next: ConditionRow) {
    const conditions = form.conditions.map((row, i) =>
      i === index ? next : row
    );
    onChange({ ...form, conditions });
  }

  function addRow() {
    onChange({
      ...form,
      conditions: [
        ...form.conditions,
        { attr: "subtotal_won", op: "gte", value: "" },
      ],
    });
  }

  function removeRow(index: number) {
    onChange({
      ...form,
      conditions: form.conditions.filter((_, i) => i !== index),
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-edge-soft bg-panel p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("promotions.conditionsTitle")}
        </p>
        <p className="mt-0.5 text-[11px] text-faint">
          {t("promotions.conditionsHint")}
        </p>
      </div>

      {form.conditions.length === 0 && (
        <p className="text-xs text-faint">{t("promotions.noConditions")}</p>
      )}

      {form.conditions.map((row, index) => {
        const kind = attrKind(row.attr);
        const ops = opsForKind(kind);
        return (
          <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
            <select
              aria-label={t("promotions.conditionAttr")}
              value={row.attr}
              onChange={(e) => {
                const attr = e.target.value;
                const nextOps = opsForKind(attrKind(attr));
                setRow(index, {
                  attr,
                  op: nextOps.includes(row.op) ? row.op : nextOps[0],
                  value: "",
                });
              }}
              className={inputCls}
            >
              {CONDITION_ATTRS.map((a) => (
                <option key={a.attr} value={a.attr}>
                  {t(a.labelKey)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("promotions.conditionOp")}
              value={row.op}
              onChange={(e) =>
                setRow(index, {
                  ...row,
                  op: e.target.value as ConditionRow["op"],
                })
              }
              className={inputCls}
            >
              {ops.map((op) => (
                <option key={op} value={op}>
                  {t(`promotions.op_${op}`)}
                </option>
              ))}
            </select>
            {kind === "boolean" ? (
              <select
                aria-label={t("promotions.conditionValue")}
                value={row.value || "true"}
                onChange={(e) => setRow(index, { ...row, value: e.target.value })}
                className={inputCls}
              >
                <option value="true">{t("promotions.valueTrue")}</option>
                <option value="false">{t("promotions.valueFalse")}</option>
              </select>
            ) : (
              <input
                aria-label={t("promotions.conditionValue")}
                value={row.value}
                onChange={(e) => setRow(index, { ...row, value: e.target.value })}
                className={inputCls}
                placeholder={
                  isSetOp(row.op)
                    ? t("promotions.valueListPlaceholder")
                    : kind === "number"
                      ? "100000"
                      : t("promotions.valuePlaceholder")
                }
                inputMode={kind === "number" && !isSetOp(row.op) ? "numeric" : "text"}
              />
            )}
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="rounded-xl border border-edge px-3 py-2 text-xs font-semibold text-muted transition hover:bg-page"
            >
              {t("promotions.removeCondition")}
            </button>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={addRow}
          className="rounded-xl border border-edge px-4 py-2 text-xs font-semibold text-accent transition hover:bg-page"
        >
          {t("promotions.addCondition")}
        </button>

        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={form.excludeOnSale}
            onChange={(e) =>
              onChange({ ...form, excludeOnSale: e.target.checked })
            }
            className="size-4 rounded border-edge text-accent focus:ring-accent/20"
          />
          {t("promotions.excludeOnSale")}
        </label>

        {hasLinePredicate && (
          <label className="flex items-center gap-2 text-xs text-muted">
            {t("promotions.lineMatch")}
            <select
              value={form.lineMatch}
              onChange={(e) =>
                onChange({
                  ...form,
                  lineMatch: e.target.value as PromotionFormState["lineMatch"],
                })
              }
              className="rounded-xl border border-edge bg-panel px-3 py-1.5 text-xs text-ink"
            >
              <option value="any">{t("promotions.lineMatchAny")}</option>
              <option value="all">{t("promotions.lineMatchAll")}</option>
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

function describeBenefit(
  promotion: Promotion,
  formatWon: (amount: number) => string,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  const benefit = effectiveBenefit(promotion);
  if (!benefit) return t("common.emptyValue");
  if (benefit.discount_type === "fixed") {
    return formatWon(benefit.discount_fixed_won ?? 0);
  }
  const percent = `${Math.round((benefit.discount_fraction ?? 0) * 100)}%`;
  return benefit.max_discount_won
    ? t("promotions.percentWithCap", {
        percent,
        cap: formatWon(benefit.max_discount_won),
      })
    : percent;
}

/** Expiry instants are authored as end-of-day KST, so they read back in KST. */
function formatExpiry(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Date(at.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
