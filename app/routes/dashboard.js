import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getOrders, getProducts } from "~/lib/api";
export function meta() {
    return [{ title: "Dashboard | Schick Admin" }];
}
export default function Dashboard() {
    const [products, setProducts] = useState([]);
    const [recentOrders, setRecentOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        Promise.all([
            getProducts().catch(() => []),
            getOrders().then((o) => o.slice(0, 5)),
        ]).then(([prods, orders]) => {
            setProducts(prods);
            setRecentOrders(orders);
            setLoading(false);
        });
    }, []);
    return (_jsxs("div", { className: "space-y-8", children: [_jsx(PageHeader, {}), _jsx(StatsGrid, { products: products, loading: loading }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-3", children: [_jsx("div", { className: "lg:col-span-2", children: _jsx(RecentOrdersTable, { orders: recentOrders }) }), _jsx(QuickPanel, { products: products })] })] }));
}
function PageHeader() {
    const now = new Date();
    const formatted = now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
    return (_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-[#1C1B1F] sm:text-2xl", children: "Dashboard" }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: formatted })] }), _jsx(Link, { to: "/orders", className: "w-full rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-[#5A38E8] active:scale-[0.98] sm:w-auto", children: "View all orders" })] }));
}
function StatsGrid({ products, loading, }) {
    const active = products.length;
    const outOfStock = products.filter((p) => (p.stock ?? 0) === 0).length;
    const cards = [
        {
            label: "Revenue today",
            value: "—",
            sub: "Analytics not yet available",
            icon: _jsx(RevenueIcon, {}),
            color: "bg-violet-50 text-violet-600",
        },
        {
            label: "Orders today",
            value: "—",
            sub: "Analytics not yet available",
            icon: _jsx(OrderIcon, {}),
            color: "bg-blue-50 text-blue-600",
        },
        {
            label: "Catalog items",
            value: loading ? "…" : String(active),
            sub: loading ? null : "From product search",
            icon: _jsx(BoxIcon, {}),
            color: "bg-emerald-50 text-emerald-600",
        },
        {
            label: "Pending orders",
            value: "—",
            sub: "Analytics not yet available",
            icon: _jsx(ClockIcon, {}),
            color: "bg-amber-50 text-amber-600",
        },
    ];
    return (_jsx("div", { className: "grid gap-4 sm:grid-cols-2 xl:grid-cols-4", children: cards.map((card) => (_jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsx("div", { className: "flex items-start justify-between", children: _jsx("div", { className: `rounded-xl p-2.5 ${card.color}`, children: card.icon }) }), _jsxs("div", { className: "mt-4", children: [_jsx("div", { className: "text-2xl font-bold text-[#1C1B1F]", children: card.value }), _jsx("div", { className: "mt-0.5 text-sm font-medium text-[#6B6480]", children: card.label }), card.sub && (_jsx("div", { className: "mt-1 text-xs text-[#9D98B3]", children: card.sub }))] })] }, card.label))) }));
}
function RecentOrdersTable({ orders }) {
    return (_jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-[#E5E3EE] px-5 py-4", children: [_jsx("h2", { className: "font-semibold text-[#1C1B1F]", children: "Recent orders" }), _jsx(Link, { to: "/orders", className: "text-xs font-medium text-[#6D4AFF] hover:underline", children: "View all \u2192" })] }), _jsx("div", { className: "overflow-x-auto md:overflow-visible", children: _jsxs("table", { className: "hidden w-full text-sm md:table", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#F0EEF8] text-left", children: ["Order", "Customer", "Total", "Status", "Date"].map((h) => (_jsx("th", { className: "px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: h }, h))) }) }), _jsx("tbody", { children: orders.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "px-5 py-10 text-center text-[#9D98B3]", children: "No orders yet" }) })) : (orders.map((order) => (_jsxs("tr", { className: "border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]", children: [_jsx("td", { className: "px-5 py-3.5 font-mono text-xs font-medium text-[#1C1B1F]", children: order.id }), _jsx("td", { className: "px-5 py-3.5 text-[#1C1B1F]", children: order.customer_id }), _jsx("td", { className: "px-5 py-3.5 font-semibold text-[#1C1B1F]", children: formatCurrency(order.total_cents / 100) }), _jsx("td", { className: "px-5 py-3.5", children: _jsx(OrderStatusBadge, { status: order.status }) }), _jsx("td", { className: "px-5 py-3.5 text-[#9D98B3]", children: formatDate(order.created_at) })] }, order.id)))) })] }) }), _jsx("div", { className: "divide-y divide-[#F0EEF8] md:hidden", children: orders.length === 0 ? (_jsx("div", { className: "px-4 py-10 text-center text-[#9D98B3]", children: "No orders yet" })) : (orders.map((order) => (_jsxs("div", { className: "space-y-2 px-4 py-4", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-mono text-xs font-medium text-[#1C1B1F]", children: order.id }), _jsx("p", { className: "mt-1 text-sm text-[#6B6480]", children: order.customer_id })] }), _jsx(OrderStatusBadge, { status: order.status })] }), _jsxs("div", { className: "flex items-center justify-between text-sm", children: [_jsx("span", { className: "font-semibold text-[#1C1B1F]", children: formatCurrency(order.total_cents / 100) }), _jsx("span", { className: "text-[#9D98B3]", children: formatDate(order.created_at) })] })] }, order.id)))) })] }));
}
function QuickPanel({ products }) {
    const outOfStock = products.filter((p) => (p.stock ?? 0) === 0);
    const lowStock = products.filter((p) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 5);
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsx("h2", { className: "mb-3 font-semibold text-[#1C1B1F]", children: "Quick actions" }), _jsxs("div", { className: "space-y-2", children: [_jsxs(Link, { to: "/products", className: "flex items-center gap-3 rounded-xl border border-[#E5E3EE] px-4 py-3 text-sm font-medium text-[#1C1B1F] transition hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC]", children: [_jsx("span", { className: "rounded-lg bg-violet-50 p-1.5 text-violet-600", children: _jsx(PlusIcon, {}) }), "Browse catalog"] }), _jsxs(Link, { to: "/orders", className: "flex items-center gap-3 rounded-xl border border-[#E5E3EE] px-4 py-3 text-sm font-medium text-[#1C1B1F] transition hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC]", children: [_jsx("span", { className: "rounded-lg bg-blue-50 p-1.5 text-blue-600", children: _jsx(FulfillIcon, {}) }), "Fulfil pending orders"] }), _jsxs(Link, { to: "/analytics", className: "flex items-center gap-3 rounded-xl border border-[#E5E3EE] px-4 py-3 text-sm font-medium text-[#1C1B1F] transition hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC]", children: [_jsx("span", { className: "rounded-lg bg-emerald-50 p-1.5 text-emerald-600", children: _jsx(ChartIcon, {}) }), "View analytics"] })] })] }), (outOfStock.length > 0 || lowStock.length > 0) && (_jsxs("div", { className: "rounded-2xl border border-amber-200 bg-amber-50 p-5", children: [_jsxs("h2", { className: "mb-3 flex items-center gap-2 font-semibold text-amber-900", children: [_jsx("span", { className: "text-amber-500", children: "\u26A0" }), " Stock alerts"] }), _jsxs("div", { className: "space-y-2", children: [outOfStock.map((p) => (_jsxs("div", { className: "flex items-center justify-between text-sm", children: [_jsx("span", { className: "truncate text-amber-900", children: p.name }), _jsx("span", { className: "ml-2 shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700", children: "Out of stock" })] }, p.id))), lowStock.map((p) => (_jsxs("div", { className: "flex items-center justify-between text-sm", children: [_jsx("span", { className: "truncate text-amber-900", children: p.name }), _jsxs("span", { className: "ml-2 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800", children: [p.stock, " left"] })] }, p.id)))] })] }))] }));
}
export function OrderStatusBadge({ status }) {
    const map = {
        pending: { label: "Pending", class: "bg-amber-100 text-amber-800" },
        confirmed: { label: "Confirmed", class: "bg-blue-100 text-blue-800" },
        fulfilled: { label: "Fulfilled", class: "bg-emerald-100 text-emerald-800" },
        canceled: { label: "Canceled", class: "bg-slate-100 text-slate-600" },
    };
    const { label, class: cls } = map[status];
    return (_jsx("span", { className: `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`, children: label }));
}
function formatCurrency(n) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
    }).format(n);
}
function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function RevenueIcon() {
    return (_jsx("svg", { className: "size-5", viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }) }));
}
function OrderIcon() {
    return (_jsx("svg", { className: "size-5", viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6zM3 6h18M16 10a4 4 0 01-8 0", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }) }));
}
function BoxIcon() {
    return (_jsxs("svg", { className: "size-5", viewBox: "0 0 24 24", fill: "none", children: [_jsx("path", { d: "M12 2l9 4.5V17L12 21.5 3 17V6.5L12 2z", stroke: "currentColor", strokeWidth: "1.8", strokeLinejoin: "round" }), _jsx("path", { d: "M12 2v19.5M3 6.5l9 4.5 9-4.5", stroke: "currentColor", strokeWidth: "1.8", strokeLinejoin: "round" })] }));
}
function ClockIcon() {
    return (_jsxs("svg", { className: "size-5", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { cx: "12", cy: "12", r: "9", stroke: "currentColor", strokeWidth: "1.8" }), _jsx("path", { d: "M12 7v5l3 3", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" })] }));
}
function PlusIcon() {
    return (_jsx("svg", { className: "size-4", viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M12 5v14M5 12h14", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }) }));
}
function FulfillIcon() {
    return (_jsx("svg", { className: "size-4", viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }) }));
}
function ChartIcon() {
    return (_jsx("svg", { className: "size-4", viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M3 17l4-5 4 3 4-6 4 4", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }) }));
}
