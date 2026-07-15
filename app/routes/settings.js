import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useI18n } from "~/lib/i18n";
import { LanguageSwitcher } from "~/lib/i18n/LanguageSwitcher";
import { useNotify } from "~/lib/notifications";
export function meta() {
    return [{ title: "Settings | Dupli1 Admin" }];
}
const defaultSite = {
    storeName: "Dupli1",
    contactEmail: "admin@dupli1.co",
    currency: "USD",
    timezone: "America/New_York",
    maintenanceMode: false,
};
const defaultNotif = {
    newOrder: true,
    lowStock: true,
    refundRequest: true,
    newUser: false,
    weeklyReport: true,
};
export default function Settings() {
    const { t } = useI18n();
    const { notify } = useNotify();
    const [site, setSite] = useState(defaultSite);
    const [notif, setNotif] = useState(defaultNotif);
    const [savingSite, setSavingSite] = useState(false);
    const [savingNotif, setSavingNotif] = useState(false);
    async function saveSite(e) {
        e.preventDefault();
        setSavingSite(true);
        await new Promise((r) => setTimeout(r, 600));
        setSavingSite(false);
        notify(t("settings.settingsSaved"));
    }
    async function saveNotif(e) {
        e.preventDefault();
        setSavingNotif(true);
        await new Promise((r) => setTimeout(r, 500));
        setSavingNotif(false);
        notify(t("settings.notificationPrefsSaved"));
    }
    function toggleNotif(key) {
        setNotif((n) => ({ ...n, [key]: !n[key] }));
    }
    const notifItems = [
        {
            key: "newOrder",
            label: t("settings.notifNewOrder"),
            desc: t("settings.notifNewOrderDesc"),
        },
        {
            key: "lowStock",
            label: t("settings.notifLowStock"),
            desc: t("settings.notifLowStockDesc"),
        },
        {
            key: "refundRequest",
            label: t("settings.notifRefundRequest"),
            desc: t("settings.notifRefundRequestDesc"),
        },
        {
            key: "newUser",
            label: t("settings.notifNewUser"),
            desc: t("settings.notifNewUserDesc"),
        },
        {
            key: "weeklyReport",
            label: t("settings.notifWeeklyReport"),
            desc: t("settings.notifWeeklyReportDesc"),
        },
    ];
    return (_jsxs("div", { className: "space-y-8 max-w-2xl", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-[#1C1B1F] sm:text-2xl", children: t("settings.title") }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: t("settings.subtitle") })] }), _jsx(Section, { title: t("settings.sectionGeneral"), description: t("settings.sectionGeneralDesc"), children: _jsxs("form", { onSubmit: saveSite, className: "space-y-4", children: [_jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: t("settings.storeName"), children: _jsx("input", { value: site.storeName, onChange: (e) => setSite((s) => ({ ...s, storeName: e.target.value })), className: inputCls }) }), _jsx(Field, { label: t("settings.contactEmail"), children: _jsx("input", { type: "email", value: site.contactEmail, onChange: (e) => setSite((s) => ({ ...s, contactEmail: e.target.value })), className: inputCls }) })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx(LanguageSwitcher, {}), _jsx("p", { className: "text-xs text-[#9D98B3]", children: t("settings.languageDesc") })] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: t("settings.currency"), children: _jsxs("select", { value: site.currency, onChange: (e) => setSite((s) => ({ ...s, currency: e.target.value })), className: inputCls, children: [_jsx("option", { value: "USD", children: t("settings.currencyUsd") }), _jsx("option", { value: "EUR", children: t("settings.currencyEur") }), _jsx("option", { value: "GBP", children: t("settings.currencyGbp") }), _jsx("option", { value: "JPY", children: t("settings.currencyJpy") }), _jsx("option", { value: "KRW", children: t("settings.currencyKrw") }), _jsx("option", { value: "CNY", children: t("settings.currencyCny") })] }) }), _jsx(Field, { label: t("settings.timezone"), children: _jsxs("select", { value: site.timezone, onChange: (e) => setSite((s) => ({ ...s, timezone: e.target.value })), className: inputCls, children: [_jsx("option", { value: "America/New_York", children: t("settings.timezoneEt") }), _jsx("option", { value: "America/Los_Angeles", children: t("settings.timezonePt") }), _jsx("option", { value: "Europe/London", children: t("settings.timezoneGmt") }), _jsx("option", { value: "Europe/Paris", children: t("settings.timezoneCet") }), _jsx("option", { value: "Asia/Tokyo", children: t("settings.timezoneJst") }), _jsx("option", { value: "Asia/Seoul", children: t("settings.timezoneKst") }), _jsx("option", { value: "Asia/Shanghai", children: t("settings.timezoneCst") })] }) })] }), _jsxs("div", { className: "flex flex-col gap-3 rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] px-4 py-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-[#1C1B1F]", children: t("settings.maintenanceMode") }), _jsx("p", { className: "text-xs text-[#9D98B3]", children: t("settings.maintenanceModeDesc") })] }), _jsx(Toggle, { enabled: site.maintenanceMode, onChange: (v) => setSite((s) => ({ ...s, maintenanceMode: v })) })] }), _jsx("div", { className: "pt-1", children: _jsx("button", { type: "submit", disabled: savingSite, className: "rounded-xl bg-[#6D4AFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60", children: savingSite ? t("settings.saving") : t("settings.saveChanges") }) })] }) }), _jsx(Section, { title: t("settings.sectionNotifications"), description: t("settings.sectionNotificationsDesc"), children: _jsxs("form", { onSubmit: saveNotif, className: "space-y-4", children: [notifItems.map(({ key, label, desc }) => (_jsxs("div", { className: "flex flex-col gap-3 rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] px-4 py-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-[#1C1B1F]", children: label }), _jsx("p", { className: "text-xs text-[#9D98B3]", children: desc })] }), _jsx(Toggle, { enabled: notif[key], onChange: () => toggleNotif(key) })] }, key))), _jsx("div", { className: "pt-1", children: _jsx("button", { type: "submit", disabled: savingNotif, className: "rounded-xl bg-[#6D4AFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60", children: savingNotif
                                    ? t("settings.saving")
                                    : t("settings.savePreferences") }) })] }) }), _jsx(Section, { title: t("settings.sectionDanger"), description: t("settings.sectionDangerDesc"), children: _jsx("div", { className: "rounded-xl border border-red-200 bg-red-50 p-5", children: _jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-red-900", children: t("settings.clearAllProductData") }), _jsx("p", { className: "mt-0.5 text-xs text-red-700", children: t("settings.clearAllProductDataDesc") })] }), _jsx("button", { type: "button", className: "shrink-0 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50", onClick: () => alert(t("settings.notImplementedDemo")), children: t("settings.clearData") })] }) }) })] }));
}
function Section({ title, description, children, }) {
    return (_jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsxs("div", { className: "mb-5 border-b border-[#E5E3EE] pb-4", children: [_jsx("h2", { className: "font-bold text-[#1C1B1F]", children: title }), _jsx("p", { className: "mt-0.5 text-xs text-[#9D98B3]", children: description })] }), children] }));
}
function Field({ label, children, }) {
    return (_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "block text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: label }), children] }));
}
function Toggle({ enabled, onChange, }) {
    return (_jsx("button", { type: "button", role: "switch", "aria-checked": enabled, onClick: () => onChange(!enabled), className: [
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
            enabled ? "bg-[#6D4AFF]" : "bg-[#D1CDE6]",
        ].join(" "), children: _jsx("span", { className: [
                "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
                enabled ? "translate-x-4" : "translate-x-0",
            ].join(" ") }) }));
}
const inputCls = "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";
