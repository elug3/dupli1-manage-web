import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { getAnalytics } from "~/lib/api";
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
        return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-[#1C1B1F]", children: "Analytics" }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: "Derived from order service data" })] }), _jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-12 text-center shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsx("p", { className: "font-semibold text-[#1C1B1F]", children: "No order data yet" }), _jsxs("p", { className: "mt-1 text-sm text-[#9D98B3]", children: ["Analytics are computed from ", _jsx("code", { className: "text-xs", children: "GET /order/api/v1/orders" }), "."] })] })] }));
    }
    const revenueCents = period === "7d" ? data.revenue7d : data.revenue30d;
    const orders = period === "7d" ? data.orders7d : data.orders30d;
    const revenue = revenueCents / 100;
    const aov = orders > 0 ? revenue / orders : 0;
    return (_jsxs("div", { className: "space-y-8", children: [_jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-[#1C1B1F]", children: "Analytics" }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: "Derived from order service totals" })] }), _jsx("div", { className: "flex gap-1 rounded-xl border border-[#E5E3EE] bg-white p-1 shadow-[0_1px_3px_rgba(28,27,31,0.04)]", children: ["7d", "30d"].map((p) => (_jsx("button", { onClick: () => setPeriod(p), className: [
                                "rounded-lg px-4 py-1.5 text-xs font-semibold transition",
                                period === p
                                    ? "bg-[#6D4AFF] text-white shadow-sm"
                                    : "text-[#6B6480] hover:bg-[#F4F3F8]",
                            ].join(" "), children: p === "7d" ? "7 days" : "30 days" }, p))) })] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-3", children: [_jsx(KpiCard, { label: "Revenue", value: formatCurrency(revenue) }), _jsx(KpiCard, { label: "Orders", value: String(orders) }), _jsx(KpiCard, { label: "Avg. order value", value: formatCurrency(aov) })] })] }));
}
function KpiCard({ label, value }) {
    return (_jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsx("div", { className: "text-2xl font-bold text-[#1C1B1F]", children: value }), _jsx("div", { className: "mt-0.5 text-sm text-[#6B6480]", children: label })] }));
}
function formatCurrency(n) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
    }).format(n);
}
