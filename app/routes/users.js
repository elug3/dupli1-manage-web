import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { formatPermissions, isCustomerUser, isManagerUser, listUsers, } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
export function meta() {
    return [{ title: "Users | Dupli1 Admin" }];
}
export default function Users() {
    const { t } = useI18n();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState("customers");
    const [search, setSearch] = useState("");
    useEffect(() => {
        setLoading(true);
        setError(null);
        listUsers()
            .then(setUsers)
            .catch((err) => {
            setUsers([]);
            setError(err instanceof Error ? err.message : t("users.failedToLoad"));
        })
            .finally(() => setLoading(false));
    }, []);
    const counts = useMemo(() => ({
        customers: users.filter(isCustomerUser).length,
        managers: users.filter(isManagerUser).length,
    }), [users]);
    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return users.filter((user) => {
            const inTab = activeTab === "customers"
                ? isCustomerUser(user)
                : isManagerUser(user);
            if (!inTab)
                return false;
            if (!needle)
                return true;
            return (user.email.toLowerCase().includes(needle) ||
                user.user_id.toLowerCase().includes(needle) ||
                user.account_type.toLowerCase().includes(needle) ||
                user.permissions.some((perm) => perm.toLowerCase().includes(needle)));
        });
    }, [users, activeTab, search]);
    const tabs = [
        { labelKey: "users.tabCustomers", value: "customers" },
        { labelKey: "users.tabManagers", value: "managers" },
    ];
    const headers = [
        t("users.colEmail"),
        t("users.colPermissions"),
        t("users.colStatus"),
        "",
    ];
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-[#1C1B1F] sm:text-2xl", children: t("users.title") }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: t("users.subtitle") })] }), _jsxs(Link, { to: "/users/new", className: "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5A38E8] active:scale-[0.98] sm:w-auto", children: [_jsx(PlusIcon, {}), t("users.newUser")] })] }), _jsx("div", { className: "flex flex-wrap gap-2", children: tabs.map((tab) => (_jsx("button", { onClick: () => setActiveTab(tab.value), className: [
                        "rounded-full px-4 py-1.5 text-sm font-medium transition",
                        activeTab === tab.value
                            ? "bg-[#6D4AFF] text-white"
                            : "border border-[#E5E3EE] bg-white text-[#6B6480] hover:border-[#6D4AFF]/40",
                    ].join(" "), children: t("users.tabWithCount", {
                        label: t(tab.labelKey),
                        count: counts[tab.value],
                    }) }, tab.value))) }), _jsx("input", { type: "search", placeholder: t("users.filterPlaceholder"), value: search, onChange: (e) => setSearch(e.target.value), className: "w-full max-w-md rounded-xl border border-[#E5E3EE] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20" }), error && (_jsx("div", { className: "rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600", children: error })), _jsx("div", { className: "overflow-hidden rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: loading ? (_jsx("div", { className: "flex items-center justify-center py-20", children: _jsx("div", { className: "h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }) })) : filtered.length === 0 ? (_jsx("div", { className: "px-5 py-16 text-center text-[#9D98B3]", children: t("users.noUsersFound") })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "divide-y divide-[#F0EEF8] md:hidden", children: filtered.map((user) => (_jsx(UserCard, { user: user }, user.user_id))) }), _jsx("div", { className: "hidden overflow-x-auto md:block", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#F0EEF8] bg-[#FAFAFA] text-left", children: headers.map((heading, i) => (_jsx("th", { className: "px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: heading }, heading || `actions-${i}`))) }) }), _jsx("tbody", { children: filtered.map((user) => (_jsxs("tr", { className: "border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]", children: [_jsxs("td", { className: "px-5 py-3.5", children: [_jsx("p", { className: "font-medium text-[#1C1B1F]", children: user.email }), _jsx("p", { className: "mt-0.5 font-mono text-xs text-[#6B6480]", children: user.user_id })] }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: formatPermissions(user.permissions) }), _jsx("td", { className: "px-5 py-3.5", children: _jsx(UserStatusBadge, { user: user }) }), _jsx("td", { className: "px-5 py-3.5 text-right", children: _jsx(Link, { to: `/users/${encodeURIComponent(user.user_id)}`, className: "text-xs font-semibold text-[#6D4AFF] hover:underline", children: t("users.detailsArrow") }) })] }, user.user_id))) })] }) })] })) })] }));
}
function UserCard({ user }) {
    const { t } = useI18n();
    return (_jsxs("div", { className: "space-y-3 p-4", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium text-[#1C1B1F]", children: user.email }), _jsx("p", { className: "mt-1 font-mono text-xs text-[#6B6480]", children: user.user_id })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 text-xs text-[#6B6480]", children: [_jsx("span", { className: "rounded-full bg-[#F4F3F8] px-2.5 py-1", children: formatPermissions(user.permissions) }), _jsx(UserStatusBadge, { user: user })] }), _jsx(Link, { to: `/users/${encodeURIComponent(user.user_id)}`, className: "inline-flex text-xs font-semibold text-[#6D4AFF] hover:underline", children: t("users.detailsArrow") })] }));
}
function UserStatusBadge({ user }) {
    const { t } = useI18n();
    if (user.locked_at) {
        return (_jsx("span", { className: "inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700", children: t("users.statusLocked") }));
    }
    return (_jsx("span", { className: [
            "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
            user.is_active
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600",
        ].join(" "), children: user.is_active ? t("users.statusActive") : t("users.statusInactive") }));
}
function PlusIcon() {
    return (_jsx("svg", { className: "size-4", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: _jsx("path", { d: "M12 5v14M5 12h14", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }) }));
}
