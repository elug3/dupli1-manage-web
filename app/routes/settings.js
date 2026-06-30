import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
export function meta() {
    return [{ title: "Settings | Schick Admin" }];
}
const defaultSite = {
    storeName: "Schick",
    contactEmail: "admin@schick.co",
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
    const [site, setSite] = useState(defaultSite);
    const [notif, setNotif] = useState(defaultNotif);
    const [savingSite, setSavingSite] = useState(false);
    const [savingNotif, setSavingNotif] = useState(false);
    const [siteSuccess, setSiteSuccess] = useState(false);
    const [notifSuccess, setNotifSuccess] = useState(false);
    async function saveSite(e) {
        e.preventDefault();
        setSavingSite(true);
        await new Promise((r) => setTimeout(r, 600));
        setSavingSite(false);
        setSiteSuccess(true);
        setTimeout(() => setSiteSuccess(false), 3000);
    }
    async function saveNotif(e) {
        e.preventDefault();
        setSavingNotif(true);
        await new Promise((r) => setTimeout(r, 500));
        setSavingNotif(false);
        setNotifSuccess(true);
        setTimeout(() => setNotifSuccess(false), 3000);
    }
    function toggleNotif(key) {
        setNotif((n) => ({ ...n, [key]: !n[key] }));
    }
    return (_jsxs("div", { className: "space-y-8 max-w-2xl", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-[#1C1B1F] sm:text-2xl", children: "Settings" }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: "Manage your store configuration" })] }), _jsx(Section, { title: "General", description: "Core store settings and identity.", children: _jsxs("form", { onSubmit: saveSite, className: "space-y-4", children: [_jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Store name", children: _jsx("input", { value: site.storeName, onChange: (e) => setSite((s) => ({ ...s, storeName: e.target.value })), className: inputCls }) }), _jsx(Field, { label: "Contact email", children: _jsx("input", { type: "email", value: site.contactEmail, onChange: (e) => setSite((s) => ({ ...s, contactEmail: e.target.value })), className: inputCls }) })] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Currency", children: _jsxs("select", { value: site.currency, onChange: (e) => setSite((s) => ({ ...s, currency: e.target.value })), className: inputCls, children: [_jsx("option", { value: "USD", children: "USD \u2014 US Dollar" }), _jsx("option", { value: "EUR", children: "EUR \u2014 Euro" }), _jsx("option", { value: "GBP", children: "GBP \u2014 British Pound" }), _jsx("option", { value: "JPY", children: "JPY \u2014 Japanese Yen" })] }) }), _jsx(Field, { label: "Timezone", children: _jsxs("select", { value: site.timezone, onChange: (e) => setSite((s) => ({ ...s, timezone: e.target.value })), className: inputCls, children: [_jsx("option", { value: "America/New_York", children: "America/New_York (ET)" }), _jsx("option", { value: "America/Los_Angeles", children: "America/Los_Angeles (PT)" }), _jsx("option", { value: "Europe/London", children: "Europe/London (GMT)" }), _jsx("option", { value: "Europe/Paris", children: "Europe/Paris (CET)" }), _jsx("option", { value: "Asia/Tokyo", children: "Asia/Tokyo (JST)" })] }) })] }), _jsxs("div", { className: "flex flex-col gap-3 rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] px-4 py-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-[#1C1B1F]", children: "Maintenance mode" }), _jsx("p", { className: "text-xs text-[#9D98B3]", children: "Displays a maintenance page to customers" })] }), _jsx(Toggle, { enabled: site.maintenanceMode, onChange: (v) => setSite((s) => ({ ...s, maintenanceMode: v })) })] }), _jsxs("div", { className: "flex items-center gap-3 pt-1", children: [_jsx("button", { type: "submit", disabled: savingSite, className: "rounded-xl bg-[#6D4AFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60", children: savingSite ? "Saving…" : "Save changes" }), siteSuccess && (_jsxs("span", { className: "flex items-center gap-1.5 text-sm font-medium text-emerald-600", children: [_jsx("svg", { className: "size-4", viewBox: "0 0 20 20", fill: "currentColor", children: _jsx("path", { fillRule: "evenodd", d: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z", clipRule: "evenodd" }) }), "Saved"] }))] })] }) }), _jsx(Section, { title: "Notifications", description: "Control which events trigger admin email alerts.", children: _jsxs("form", { onSubmit: saveNotif, className: "space-y-4", children: [[
                            {
                                key: "newOrder",
                                label: "New order placed",
                                desc: "Alert when a customer completes checkout",
                            },
                            {
                                key: "lowStock",
                                label: "Low stock warning",
                                desc: "Alert when a product has ≤ 5 units remaining",
                            },
                            {
                                key: "refundRequest",
                                label: "Refund request",
                                desc: "Alert when a customer requests a refund",
                            },
                            {
                                key: "newUser",
                                label: "New user registration",
                                desc: "Alert on every new customer signup",
                            },
                            {
                                key: "weeklyReport",
                                label: "Weekly summary report",
                                desc: "Digest of revenue and orders every Monday",
                            },
                        ].map(({ key, label, desc }) => (_jsxs("div", { className: "flex flex-col gap-3 rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] px-4 py-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-[#1C1B1F]", children: label }), _jsx("p", { className: "text-xs text-[#9D98B3]", children: desc })] }), _jsx(Toggle, { enabled: notif[key], onChange: () => toggleNotif(key) })] }, key))), _jsxs("div", { className: "flex items-center gap-3 pt-1", children: [_jsx("button", { type: "submit", disabled: savingNotif, className: "rounded-xl bg-[#6D4AFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60", children: savingNotif ? "Saving…" : "Save preferences" }), notifSuccess && (_jsxs("span", { className: "flex items-center gap-1.5 text-sm font-medium text-emerald-600", children: [_jsx("svg", { className: "size-4", viewBox: "0 0 20 20", fill: "currentColor", children: _jsx("path", { fillRule: "evenodd", d: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z", clipRule: "evenodd" }) }), "Saved"] }))] })] }) }), _jsx(Section, { title: "Danger zone", description: "Irreversible actions.", children: _jsx("div", { className: "rounded-xl border border-red-200 bg-red-50 p-5", children: _jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-red-900", children: "Clear all product data" }), _jsx("p", { className: "mt-0.5 text-xs text-red-700", children: "Permanently deletes all products from the catalog. This cannot be undone." })] }), _jsx("button", { type: "button", className: "shrink-0 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50", onClick: () => alert("Not implemented in demo."), children: "Clear data" })] }) }) })] }));
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
