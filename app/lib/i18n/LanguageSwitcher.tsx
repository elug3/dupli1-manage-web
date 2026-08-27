import {
  LOCALE_LABELS,
  LOCALES,
  useI18n,
  type Locale,
} from "~/lib/i18n";

const selectCls =
  "rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-xs font-medium text-ink outline-none transition hover:border-accent/40 focus:border-accent focus:ring-2 focus:ring-accent/20";

export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { locale, setLocale, t } = useI18n();

  return (
    <label
      className={["inline-flex items-center gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      {!compact && (
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("nav.language")}
        </span>
      )}
      <select
        aria-label={t("nav.language")}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className={selectCls}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
