import { type ReactNode, useEffect, useId, useState } from "react";
import { useI18n } from "~/lib/i18n";

/**
 * Confirmation for a permanent delete: a caution banner, the concrete impact,
 * and a field the operator must fill with `confirmText` before Delete enables.
 *
 * `blockedReason` explains why the backend would refuse right now (stock on
 * hand, a reservation held by an open order, …); Delete stays disabled while
 * it is set, so the operator learns what to fix instead of hitting a 409.
 */
export function DeleteConfirmDialog({
  open,
  title,
  confirmText,
  impacts,
  blockedReason,
  checking = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  confirmText: string;
  impacts: ReactNode[];
  blockedReason?: string | null;
  /** True while the impact (e.g. live stock) is still being loaded. */
  checking?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) setTyped("");
  }, [open, confirmText]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, deleting, onClose]);

  if (!open) return null;

  const matches = typed.trim() === confirmText;
  const canDelete = matches && !blockedReason && !checking && !deleting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canDelete) return;
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !deleting) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-edge bg-surface p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-ink">
          {title}
        </h2>

        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold">{t("deleteDialog.caution")}</p>
          <p className="mt-0.5">{t("deleteDialog.cannotBeUndone")}</p>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            {t("deleteDialog.impactHeading")}
          </p>
          {checking ? (
            <p className="mt-2 text-sm text-muted">{t("deleteDialog.checking")}</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink">
              {impacts.map((impact, i) => (
                <li key={i}>{impact}</li>
              ))}
            </ul>
          )}
        </div>

        {blockedReason && !checking && (
          <p className="mt-4 rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-fg">
            {blockedReason}
          </p>
        )}

        <div className="mt-5 space-y-1.5">
          <label htmlFor={inputId} className="block text-sm text-ink">
            {t("deleteDialog.typeToConfirmBefore")}
            <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-xs font-semibold text-ink">
              {confirmText}
            </code>
            {t("deleteDialog.typeToConfirmAfter")}
          </label>
          <input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            disabled={deleting}
            className="w-full rounded-xl border border-edge bg-panel px-4 py-2.5 font-mono text-sm text-ink outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-xl border border-edge px-4 py-2.5 text-sm font-semibold text-muted transition hover:border-accent/40 disabled:opacity-60"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!canDelete}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? t("deleteDialog.deleting") : t("deleteDialog.deletePermanently")}
          </button>
        </div>
      </form>
    </div>
  );
}

/** The bottom-of-page block that opens a {@link DeleteConfirmDialog}. */
export function DangerZone({
  hint,
  label,
  onClick,
}: {
  hint: string;
  label: string;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="rounded-xl border border-red-200 p-4 dark:border-red-900/50">
      <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">
        {t("deleteDialog.dangerZone")}
      </h2>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">{hint}</p>
        <button
          type="button"
          onClick={onClick}
          className="shrink-0 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-600 hover:text-white dark:border-red-800 dark:text-red-300"
        >
          {label}
        </button>
      </div>
    </section>
  );
}
