import {
  LOCALE_LABELS,
  LOCALES,
  useI18n,
  type Locale,
} from "~/lib/i18n";

const selectCls =
  "rounded-lg border border-[#E5E3EE] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C1B1F] outline-none transition hover:border-[#6D4AFF]/40 focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";

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
        <span className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
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
