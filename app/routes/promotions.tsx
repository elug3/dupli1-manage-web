import { useEffect, useState } from "react";
import {
  type Promotion,
  createPromotion,
  deletePromotion,
  getPromotions,
  updatePromotion,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "Promotions | Dupli1 Admin" }];
}

const inputCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function Promotions() {
  const { notify } = useNotify();
  const { t } = useI18n();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [description, setDescription] = useState("");
  const [expires, setExpires] = useState("");
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const discount = Number(discountPct) / 100;
    if (!code.trim() || Number.isNaN(discount) || discount <= 0 || discount > 1) {
      notify(t("promotions.invalidCodeOrDiscount"), "error");
      return;
    }

    setCreating(true);
    try {
      const created = await createPromotion({
        code: code.trim(),
        discount,
        description: description.trim() || undefined,
        expires: expires.trim() || undefined,
        active: true,
      });
      setPromotions((prev) => [...prev, created]);
      setCode("");
      setDiscountPct("");
      setDescription("");
      setExpires("");
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
    t("promotions.colDiscount"),
    t("promotions.colDescription"),
    t("promotions.colExpires"),
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
        <Field label={t("promotions.discountPercent")} id="discount" required>
          <input
            id="discount"
            type="number"
            min="1"
            max="100"
            step="1"
            value={discountPct}
            onChange={(e) => setDiscountPct(e.target.value)}
            className={inputCls}
            placeholder={t("promotions.discountPlaceholder")}
            required
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
        <Field label={t("promotions.expires")} id="expires">
          <input
            id="expires"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            className={inputCls}
            placeholder={t("promotions.expiresPlaceholder")}
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
                      {Math.round(promotion.discount * 100)}%
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {promotion.description || t("common.emptyValue")}
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {promotion.expires || t("common.emptyValue")}
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
