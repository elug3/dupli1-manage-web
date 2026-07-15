import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { LOCALE_LABELS, LOCALES, useI18n, } from "~/lib/i18n";
const selectCls = "rounded-lg border border-[#E5E3EE] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C1B1F] outline-none transition hover:border-[#6D4AFF]/40 focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";
export function LanguageSwitcher({ className, compact = false, }) {
    const { locale, setLocale, t } = useI18n();
    return (_jsxs("label", { className: ["inline-flex items-center gap-2", className]
            .filter(Boolean)
            .join(" "), children: [!compact && (_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: t("nav.language") })), _jsx("select", { "aria-label": t("nav.language"), value: locale, onChange: (e) => setLocale(e.target.value), className: selectCls, children: LOCALES.map((code) => (_jsx("option", { value: code, children: LOCALE_LABELS[code] }, code))) })] }));
}
