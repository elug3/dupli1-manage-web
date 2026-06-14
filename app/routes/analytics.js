import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { getAnalytics } from "~/lib/api";
// Backend analytics endpoints not yet implemented — shows placeholder.
export function meta() {
    return [{ title: "Analytics | Schick Admin" }];
}
export default function Analytics() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState("30d");
    useEffect(() => {
        getAnalytics()
            .then(setData)
            .finally(() => setLoading(false));
    }, []);
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center py-32", children: _jsx("div", { className: "h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }) }));
    }
    if (!data) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-[#1C1B1F]", children: "Analytics" }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: "Revenue and performance overview" })] }), _jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-12 text-center shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsx("div", { className: "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F4F3F8]", children: _jsxs("svg", { className: "size-6 text-[#9D98B3]", viewBox: "0 0 24 24", fill: "none", children: [_jsx("path", { d: "M3 17l4-5 4 3 4-6 4 4", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }), _jsx("path", { d: "M3 21h18", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" })] }) }), _jsx("p", { className: "font-semibold text-[#1C1B1F]", children: "Analytics not yet available" }), _jsx("p", { className: "mt-1 text-sm text-[#9D98B3]", children: "Analytics endpoints are not yet implemented in the backend." })] })] }));
    }
    const revenue = period === "7d"
        ? data.revenue7d
        : period === "30d"
            ? data.revenue30d
            : data.revenue90d;
    const orders = period === "7d"
        ? data.orders7d
        : period === "30d"
            ? data.orders30d
            : data.orders30d * 3;
    const aov = orders > 0 ? revenue / orders : 0;
    const maxRevenue = Math.max(...data.topCategories.map((c) => c.revenue));
    return (_jsxs("div", { className: "space-y-8", children: [_jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-[#1C1B1F]", children: "Analytics" }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: "Revenue and performance overview" })] }), _jsx("div", { className: "flex gap-1 rounded-xl border border-[#E5E3EE] bg-white p-1 shadow-[0_1px_3px_rgba(28,27,31,0.04)]", children: ["7d", "30d", "90d"].map((p) => (_jsx("button", { onClick: () => setPeriod(p), className: [
                                "rounded-lg px-4 py-1.5 text-xs font-semibold transition",
                                period === p
                                    ? "bg-[#6D4AFF] text-white shadow-sm"
                                    : "text-[#6B6480] hover:bg-[#F4F3F8]",
                            ].join(" "), children: p === "7d" ? "7 days" : p === "30d" ? "30 days" : "90 days" }, p))) })] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-3", children: [_jsx(KpiCard, { label: "Revenue", value: formatCurrency(revenue), icon: _jsx(RevenueIcon, {}), color: "bg-violet-50 text-violet-600", change: "+14.2%", positive: true }), _jsx(KpiCard, { label: "Orders", value: String(orders), icon: _jsx(OrderIcon, {}), color: "bg-blue-50 text-blue-600", change: "+8.7%", positive: true }), _jsx(KpiCard, { label: "Avg. order value", value: formatCurrency(aov), icon: _jsx(AovIcon, {}), color: "bg-emerald-50 text-emerald-600", change: "+5.1%", positive: true })] }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-5", children: [_jsxs("div", { className: "lg:col-span-3 rounded-2xl border border-[#E5E3EE] bg-white p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsx("h2", { className: "mb-5 font-semibold text-[#1C1B1F]", children: "Revenue by category" }), _jsx("div", { className: "space-y-4", children: data.topCategories.map((cat) => {
                                    const pct = (cat.revenue / maxRevenue) * 100;
                                    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-1.5 flex items-center justify-between text-sm", children: [_jsx("span", { className: "font-medium text-[#1C1B1F]", children: cat.category }), _jsxs("div", { className: "flex items-center gap-3 text-[#6B6480]", children: [_jsxs("span", { className: "text-xs", children: [cat.orders, " orders"] }), _jsx("span", { className: "font-semibold text-[#1C1B1F]", children: formatCurrency(cat.revenue) })] })] }), _jsx("div", { className: "h-2 w-full overflow-hidden rounded-full bg-[#F4F3F8]", children: _jsx("div", { className: "h-full rounded-full bg-gradient-to-r from-[#6D4AFF] to-[#A78BFA] transition-all duration-500", style: { width: `${pct}%` } }) })] }, cat.category));
                                }) })] }), _jsxs("div", { className: "lg:col-span-2 rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsx("div", { className: "border-b border-[#E5E3EE] px-5 py-4", children: _jsx("h2", { className: "font-semibold text-[#1C1B1F]", children: "Top products" }) }), _jsx("div", { className: "divide-y divide-[#F0EEF8]", children: data.topProducts.map((product, i) => (_jsxs("div", { className: "flex items-center gap-3 px-5 py-3.5", children: [_jsx("span", { className: "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F4F3F8] text-xs font-bold text-[#6B6480]", children: i + 1 }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium text-[#1C1B1F]", children: product.name }), _jsxs("p", { className: "text-xs text-[#9D98B3]", children: [product.sold, " sold"] })] }), _jsx("span", { className: "text-sm font-semibold text-[#1C1B1F]", children: formatCurrency(product.revenue) })] }, product.id))) })] })] }), _jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)] overflow-hidden", children: [_jsx("div", { className: "border-b border-[#E5E3EE] px-5 py-4", children: _jsx("h2", { className: "font-semibold text-[#1C1B1F]", children: "Category performance" }) }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#F0EEF8] bg-[#FAFAFA]", children: ["Category", "Orders", "Revenue", "Share", "Avg. order"].map((h) => (_jsx("th", { className: "px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: h }, h))) }) }), _jsx("tbody", { children: data.topCategories.map((cat) => {
                                        const totalRev = data.topCategories.reduce((s, c) => s + c.revenue, 0);
                                        const share = ((cat.revenue / totalRev) * 100).toFixed(1);
                                        const avg = cat.orders > 0 ? cat.revenue / cat.orders : 0;
                                        return (_jsxs("tr", { className: "border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]", children: [_jsx("td", { className: "px-5 py-3.5 font-medium text-[#1C1B1F]", children: cat.category }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: cat.orders }), _jsx("td", { className: "px-5 py-3.5 font-semibold text-[#1C1B1F]", children: formatCurrency(cat.revenue) }), _jsx("td", { className: "px-5 py-3.5", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "h-1.5 w-16 overflow-hidden rounded-full bg-[#F4F3F8]", children: _jsx("div", { className: "h-full rounded-full bg-[#6D4AFF]", style: { width: `${share}%` } }) }), _jsxs("span", { className: "text-xs text-[#6B6480]", children: [share, "%"] })] }) }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: formatCurrency(avg) })] }, cat.category));
                                    }) })] }) })] })] }));
}
function KpiCard({ label, value, icon, color, change, positive, }) {
    return (_jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsxs("div", { className: "flex items-start justify-between", children: [_jsx("div", { className: `rounded-xl p-2.5 ${color}`, children: icon }), _jsxs("span", { className: [
                            "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                            positive
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-red-50 text-red-700",
                        ].join(" "), children: [positive ? "↑" : "↓", " ", change] })] }), _jsxs("div", { className: "mt-4", children: [_jsx("div", { className: "text-2xl font-bold text-[#1C1B1F]", children: value }), _jsx("div", { className: "mt-0.5 text-sm text-[#6B6480]", children: label })] })] }));
}
function formatCurrency(n) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
    }).format(n);
}
function RevenueIcon() {
    return (_jsx("svg", { className: "size-5", viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }) }));
}
function OrderIcon() {
    return (_jsx("svg", { className: "size-5", viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6zM3 6h18M16 10a4 4 0 01-8 0", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }) }));
}
function AovIcon() {
    return (_jsxs("svg", { className: "size-5", viewBox: "0 0 24 24", fill: "none", children: [_jsx("path", { d: "M3 17l4-5 4 3 4-6 4 4", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }), _jsx("path", { d: "M3 21h18", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" })] }));
}
