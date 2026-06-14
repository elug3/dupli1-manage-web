import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { getOrders, updateOrderStatus, } from "~/lib/api";
import { OrderStatusBadge } from "./dashboard";
export function meta() {
    return [{ title: "Orders | Schick Admin" }];
}
const STATUS_TABS = [
    { label: "All", value: "all" },
    { label: "Pending", value: "pending" },
    { label: "Processing", value: "processing" },
    { label: "Shipped", value: "shipped" },
    { label: "Delivered", value: "delivered" },
    { label: "Cancelled", value: "cancelled" },
];
const STATUS_TRANSITIONS = {
    pending: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
};
export default function Orders() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("all");
    const [expandedId, setExpandedId] = useState(null);
    const [updatingId, setUpdatingId] = useState(null);
    useEffect(() => {
        getOrders()
            .then(setOrders)
            .catch(() => setOrders([]))
            .finally(() => setLoading(false));
    }, []);
    const filtered = activeTab === "all"
        ? orders
        : orders.filter((o) => o.status === activeTab);
    const counts = orders.reduce((acc, o) => {
        acc[o.status] = (acc[o.status] ?? 0) + 1;
        return acc;
    }, {});
    async function handleStatusChange(order, newStatus) {
        setUpdatingId(order.id);
        try {
            await updateOrderStatus(order.id, newStatus).catch(() => { });
            setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o)));
        }
        finally {
            setUpdatingId(null);
        }
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-[#1C1B1F]", children: "Orders" }), _jsxs("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: [orders.length, " orders total"] })] }), _jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-[#E5E3EE] bg-white px-4 py-2.5 text-sm text-[#6B6480] shadow-[0_1px_3px_rgba(28,27,31,0.04)]", children: [_jsx("svg", { className: "size-4", viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }) }), "Export CSV"] })] }), _jsx("div", { className: "flex flex-wrap gap-1 rounded-xl border border-[#E5E3EE] bg-white p-1 shadow-[0_1px_3px_rgba(28,27,31,0.04)] w-fit", children: STATUS_TABS.map((tab) => {
                    const count = tab.value === "all"
                        ? orders.length
                        : (counts[tab.value] ?? 0);
                    return (_jsxs("button", { onClick: () => setActiveTab(tab.value), className: [
                            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                            activeTab === tab.value
                                ? "bg-[#6D4AFF] text-white shadow-sm"
                                : "text-[#6B6480] hover:bg-[#F4F3F8] hover:text-[#1C1B1F]",
                        ].join(" "), children: [tab.label, count > 0 && (_jsx("span", { className: [
                                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                                    activeTab === tab.value
                                        ? "bg-white/20 text-white"
                                        : "bg-[#F4F3F8] text-[#6B6480]",
                                ].join(" "), children: count }))] }, tab.value));
                }) }), _jsx("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)] overflow-hidden", children: loading ? (_jsx("div", { className: "flex items-center justify-center py-20", children: _jsx("div", { className: "h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }) })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#F0EEF8] bg-[#FAFAFA]", children: [
                                        "Order ID",
                                        "Customer",
                                        "Items",
                                        "Total",
                                        "Status",
                                        "Date",
                                        "",
                                    ].map((h) => (_jsx("th", { className: "px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: h }, h))) }) }), _jsx("tbody", { children: filtered.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-5 py-16 text-center text-[#9D98B3]", children: "No orders in this status" }) })) : (filtered.map((order) => (_jsx(OrderRows, { order: order, expanded: expandedId === order.id, updating: updatingId === order.id, onToggle: () => setExpandedId(expandedId === order.id ? null : order.id), onStatusChange: (s) => handleStatusChange(order, s) }, order.id)))) })] }) })) })] }));
}
function OrderRows({ order, expanded, updating, onToggle, onStatusChange, }) {
    const transitions = STATUS_TRANSITIONS[order.status];
    return (_jsxs(_Fragment, { children: [_jsxs("tr", { className: [
                    "border-b border-[#F0EEF8] cursor-pointer transition-colors",
                    expanded ? "bg-[#F8F7FC]" : "hover:bg-[#FAFAFA]",
                ].join(" "), onClick: onToggle, children: [_jsx("td", { className: "px-5 py-3.5", children: _jsx("span", { className: "font-mono text-xs font-semibold text-[#1C1B1F]", children: order.id }) }), _jsx("td", { className: "px-5 py-3.5 text-[#1C1B1F]", children: order.customerEmail }), _jsxs("td", { className: "px-5 py-3.5 text-[#6B6480]", children: [order.itemCount, " ", order.itemCount === 1 ? "item" : "items"] }), _jsxs("td", { className: "px-5 py-3.5 font-semibold text-[#1C1B1F]", children: ["$", order.total.toFixed(0)] }), _jsx("td", { className: "px-5 py-3.5", children: _jsx(OrderStatusBadge, { status: order.status }) }), _jsx("td", { className: "px-5 py-3.5 text-[#9D98B3] text-xs", children: new Date(order.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                        }) }), _jsx("td", { className: "px-5 py-3.5 text-right", onClick: (e) => e.stopPropagation(), children: transitions.length > 0 && (_jsx("div", { className: "flex items-center justify-end gap-1", children: transitions.map((next) => (_jsx("button", { disabled: updating, onClick: () => onStatusChange(next), className: [
                                    "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition disabled:opacity-50",
                                    next === "cancelled"
                                        ? "border border-red-200 text-red-600 hover:bg-red-50"
                                        : "border border-[#E5E3EE] text-[#6B6480] hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC] hover:text-[#6D4AFF]",
                                ].join(" "), children: updating ? "…" : `→ ${next}` }, next))) })) })] }), expanded && (_jsx("tr", { className: "border-b border-[#F0EEF8] bg-[#F4F3F8]/60", children: _jsx("td", { colSpan: 7, className: "px-8 py-4", children: _jsxs("div", { className: "rounded-xl border border-[#E5E3EE] bg-white p-4", children: [_jsx("p", { className: "mb-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: "Order items" }), _jsx("div", { className: "space-y-2", children: order.items.map((item, i) => (_jsxs("div", { className: "flex items-center justify-between text-sm", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F3F8] text-xs font-bold text-[#6D4AFF]", children: item.productName.slice(0, 2).toUpperCase() }), _jsxs("div", { children: [_jsx("span", { className: "font-medium text-[#1C1B1F]", children: item.productName }), _jsxs("span", { className: "ml-2 text-[#9D98B3]", children: ["\u00D7 ", item.quantity] })] })] }), _jsxs("span", { className: "font-semibold text-[#1C1B1F]", children: ["$", item.price.toFixed(0)] })] }, i))) }), _jsxs("div", { className: "mt-3 flex items-center justify-between border-t border-[#E5E3EE] pt-3 text-sm font-bold text-[#1C1B1F]", children: [_jsx("span", { children: "Order total" }), _jsxs("span", { children: ["$", order.total.toFixed(0)] })] })] }) }) }))] }));
}
