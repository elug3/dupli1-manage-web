import { useI18n } from "~/lib/i18n";
import { useTheme, type ThemePreference } from "~/lib/theme";

const selectCls =
  "rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-xs font-medium text-ink outline-none transition hover:border-accent/40 focus:border-accent focus:ring-2 focus:ring-accent/20";

export function ThemeSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const { preference, setPreference } = useTheme();

  if (compact) {
    const cycle: ThemePreference[] = ["system", "light", "dark"];
    const next = cycle[(cycle.indexOf(preference) + 1) % cycle.length]!;
    return (
      <button
        type="button"
        onClick={() => setPreference(next)}
        className={[
          "rounded-lg border border-edge bg-surface p-2 text-muted transition hover:border-accent/40 hover:text-ink",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={t("nav.theme")}
        title={
          preference === "dark"
            ? t("nav.themeDark")
            : preference === "light"
              ? t("nav.themeLight")
              : t("nav.themeSystem")
        }
      >
        <ThemeIcon preference={preference} />
      </button>
    );
  }

  return (
    <label
      className={["inline-flex items-center gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t("nav.theme")}
      </span>
      <select
        aria-label={t("nav.theme")}
        value={preference}
        onChange={(e) => setPreference(e.target.value as ThemePreference)}
        className={selectCls}
      >
        <option value="system">{t("nav.themeSystem")}</option>
        <option value="light">{t("nav.themeLight")}</option>
        <option value="dark">{t("nav.themeDark")}</option>
      </select>
    </label>
  );
}

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === "dark") {
    return (
      <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (preference === "light") {
    return (
      <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 3v18A9 9 0 0 0 12 3Z" fill="currentColor" opacity="0.35" />
    </svg>
  );
}
