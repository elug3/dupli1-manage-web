import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { buildVariantSkuIndex, formatOrderItemVariant, getOrders, listAllProducts, shipOrder, updateOrderStatus, } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";
export function meta() {
    return [{ title: "Orders | Dupli1 Admin" }];
}
const STATUS_TAB_VALUES = [
    "all",
    "pending",
    "paid",
    "in_transit",
    "fulfilled",
    "canceled",
];
const ORDER_ACTIONS = {
    pending: [{ kind: "status", status: "canceled" }],
    paid: [
        { kind: "ship" },
        { kind: "status", status: "canceled" },
    ],
    in_transit: [{ kind: "status", status: "fulfilled" }],
    fulfilled: [],
    canceled: [],
};
function orderStatusLabel(status, t) {
    switch (status) {
        case "pending":
            return t("common.orderStatusPending");
        case "paid":
            return t("common.orderStatusPaid");
        case "in_transit":
            return t("common.orderStatusInTransit");
        case "fulfilled":
            return t("common.orderStatusFulfilled");
        case "canceled":
            return t("common.orderStatusCanceled");
        default:
            return status;
    }
}
function orderActionLabel(action, t) {
    if (action.kind === "ship")
        return t("orders.actionShip");
    if (action.status === "canceled")
        return t("orders.actionCancel");
    return t("orders.actionFulfill");
}
function orderActionKey(action) {
    return action.kind === "ship" ? "ship" : `status:${action.status}`;
}
const STATUS_BADGE_CLASS = {
    pending: "bg-amber-100 text-amber-800",
    paid: "bg-blue-100 text-blue-800",
    in_transit: "bg-violet-100 text-violet-800",
    fulfilled: "bg-emerald-100 text-emerald-800",
    canceled: "bg-slate-100 text-slate-600",
};
function OrderStatusBadge({ status }) {
    const { t } = useI18n();
    const cls = STATUS_BADGE_CLASS[status] ?? "bg-slate-100 text-slate-600";
    return (_jsx("span", { className: `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`, children: orderStatusLabel(status, t) }));
}
export default function Orders() {
    const { notify } = useNotify();
    const { t } = useI18n();
    const [orders, setOrders] = useState([]);
    const [skuLookup, setSkuLookup] = useState(() => new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState("all");
    const [expandedId, setExpandedId] = useState(null);
    const [updatingId, setUpdatingId] = useState(null);
    useEffect(() => {
        setError(null);
        Promise.all([
            getOrders().catch((err) => {
                setError(err instanceof Error ? err.message : t("orders.failedToLoad"));
                return [];
            }),
            listAllProducts().catch(() => []),
        ])
            .then(([orderList, products]) => {
            setOrders(orderList);
            setSkuLookup(buildVariantSkuIndex(products));
        })
            .finally(() => setLoading(false));
    }, [t]);
    const filtered = activeTab === "all"
        ? orders
        : orders.filter((o) => o.status === activeTab);
    const counts = orders.reduce((acc, o) => {
        acc[o.status] = (acc[o.status] ?? 0) + 1;
        return acc;
    }, {});
    const statusTabLabel = (value) => {
        switch (value) {
            case "all":
                return t("orders.tabAll");
            case "pending":
                return t("orders.tabPending");
            case "paid":
                return t("orders.tabPaid");
            case "in_transit":
                return t("orders.tabInTransit");
            case "fulfilled":
                return t("orders.tabFulfilled");
            case "canceled":
                return t("orders.tabCanceled");
            default:
                return value;
        }
    };
    async function handleOrderAction(order, action) {
        setUpdatingId(order.id);
        try {
            const updated = action.kind === "ship"
                ? await shipOrder(order.id)
                : await updateOrderStatus(order.id, action.status);
            setOrders((os) => os.map((o) => (o.id === order.id ? updated : o)));
        }
        catch (err) {
            notify(err instanceof Error ? err.message : t("orders.failedToUpdateStatus"), "error");
        }
        finally {
            setUpdatingId(null);
        }
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-[#1C1B1F] sm:text-2xl", children: t("orders.title") }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: t("orders.ordersTotal", { count: orders.length }) })] }), _jsxs("div", { className: "flex w-full items-center justify-center gap-2 rounded-xl border border-[#E5E3EE] bg-white px-4 py-2.5 text-sm text-[#6B6480] shadow-[0_1px_3px_rgba(28,27,31,0.04)] sm:w-auto sm:justify-start", children: [_jsx("svg", { className: "size-4", viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }) }), t("orders.exportCsv")] })] }), error && (_jsx("div", { className: "rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600", children: error })), _jsx("div", { className: "-mx-1 overflow-x-auto px-1 pb-1", children: _jsx("div", { className: "flex w-max max-w-full flex-wrap gap-1 rounded-xl border border-[#E5E3EE] bg-white p-1 shadow-[0_1px_3px_rgba(28,27,31,0.04)] sm:w-fit", children: STATUS_TAB_VALUES.map((value) => {
                        const count = value === "all"
                            ? orders.length
                            : (counts[value] ?? 0);
                        return (_jsxs("button", { onClick: () => setActiveTab(value), className: [
                                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                                activeTab === value
                                    ? "bg-[#6D4AFF] text-white shadow-sm"
                                    : "text-[#6B6480] hover:bg-[#F4F3F8] hover:text-[#1C1B1F]",
                            ].join(" "), children: [statusTabLabel(value), count > 0 && (_jsx("span", { className: [
                                        "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                                        activeTab === value
                                            ? "bg-white/20 text-white"
                                            : "bg-[#F4F3F8] text-[#6B6480]",
                                    ].join(" "), children: count }))] }, value));
                    }) }) }), _jsx("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)] overflow-hidden", children: loading ? (_jsx("div", { className: "flex items-center justify-center py-20", children: _jsx("div", { className: "h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }) })) : filtered.length === 0 ? (_jsx("div", { className: "px-5 py-16 text-center text-[#9D98B3]", children: t("orders.noOrdersInStatus") })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "divide-y divide-[#F0EEF8] md:hidden", children: filtered.map((order) => (_jsx(OrderCard, { order: order, skuLookup: skuLookup, expanded: expandedId === order.id, updating: updatingId === order.id, onToggle: () => setExpandedId(expandedId === order.id ? null : order.id), onAction: (action) => handleOrderAction(order, action) }, order.id))) }), _jsx("div", { className: "hidden overflow-x-auto md:block", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#F0EEF8] bg-[#FAFAFA]", children: [
                                                ["id", t("orders.colOrderId")],
                                                ["customer", t("orders.colCustomer")],
                                                ["items", t("orders.colItems")],
                                                ["total", t("orders.colTotal")],
                                                ["status", t("orders.colStatus")],
                                                ["date", t("orders.colDate")],
                                                ["actions", ""],
                                            ].map(([key, label]) => (_jsx("th", { className: "px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: label }, key))) }) }), _jsx("tbody", { children: filtered.map((order) => (_jsx(OrderRows, { order: order, skuLookup: skuLookup, expanded: expandedId === order.id, updating: updatingId === order.id, onToggle: () => setExpandedId(expandedId === order.id ? null : order.id), onAction: (action) => handleOrderAction(order, action) }, order.id))) })] }) })] })) })] }));
}
function OrderCard({ order, skuLookup, expanded, updating, onToggle, onAction, }) {
    const { t, formatDate, formatCents } = useI18n();
    const actions = ORDER_ACTIONS[order.status] ?? [];
    return (_jsxs("div", { className: "p-4", children: [_jsxs("button", { type: "button", onClick: onToggle, className: "w-full text-left", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-mono text-xs font-semibold text-[#1C1B1F]", children: order.id }), _jsx("p", { className: "mt-1 text-sm text-[#6B6480]", children: order.customer_id })] }), _jsx(OrderStatusBadge, { status: order.status })] }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm", children: [_jsx("span", { className: "font-semibold text-[#1C1B1F]", children: formatCents(order.total_cents) }), _jsx("span", { className: "text-[#6B6480]", children: t("common.itemCount", { count: order.items.length }) }), _jsx("span", { className: "text-xs text-[#9D98B3]", children: formatDate(order.created_at, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                }) })] })] }), actions.length > 0 && (_jsx("div", { className: "mt-3 flex flex-wrap gap-2", children: actions.map((action) => (_jsx("button", { type: "button", disabled: updating, onClick: () => onAction(action), className: [
                        "rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50",
                        action.kind === "status" && action.status === "canceled"
                            ? "border border-red-200 text-red-600 hover:bg-red-50"
                            : "border border-[#E5E3EE] text-[#6B6480] hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC] hover:text-[#6D4AFF]",
                    ].join(" "), children: updating
                        ? t("common.loadingEllipsis")
                        : orderActionLabel(action, t) }, orderActionKey(action)))) })), expanded && (_jsxs("div", { className: "mt-4 rounded-xl border border-[#E5E3EE] bg-[#F4F3F8]/60 p-4", children: [_jsx("p", { className: "mb-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("orders.orderItems") }), _jsx("div", { className: "space-y-2", children: order.items.map((item, i) => (_jsx(OrderItemRow, { item: item, skuLookup: skuLookup }, i))) }), _jsxs("div", { className: "mt-3 flex items-center justify-between border-t border-[#E5E3EE] pt-3 text-sm font-bold text-[#1C1B1F]", children: [_jsx("span", { children: t("orders.orderTotal") }), _jsx("span", { children: formatCents(order.total_cents) })] })] }))] }));
}
function OrderRows({ order, skuLookup, expanded, updating, onToggle, onAction, }) {
    const { t, formatDate, formatCents } = useI18n();
    const actions = ORDER_ACTIONS[order.status] ?? [];
    return (_jsxs(_Fragment, { children: [_jsxs("tr", { className: [
                    "border-b border-[#F0EEF8] cursor-pointer transition-colors",
                    expanded ? "bg-[#F8F7FC]" : "hover:bg-[#FAFAFA]",
                ].join(" "), onClick: onToggle, children: [_jsx("td", { className: "px-5 py-3.5", children: _jsx("span", { className: "font-mono text-xs font-semibold text-[#1C1B1F]", children: order.id }) }), _jsx("td", { className: "px-5 py-3.5 text-[#1C1B1F]", children: order.customer_id }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: t("common.itemCount", { count: order.items.length }) }), _jsx("td", { className: "px-5 py-3.5 font-semibold text-[#1C1B1F]", children: formatCents(order.total_cents) }), _jsx("td", { className: "px-5 py-3.5", children: _jsx(OrderStatusBadge, { status: order.status }) }), _jsx("td", { className: "px-5 py-3.5 text-[#9D98B3] text-xs", children: formatDate(order.created_at, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                        }) }), _jsx("td", { className: "px-5 py-3.5 text-right", onClick: (e) => e.stopPropagation(), children: actions.length > 0 && (_jsx("div", { className: "flex items-center justify-end gap-1", children: actions.map((action) => (_jsx("button", { disabled: updating, onClick: () => onAction(action), className: [
                                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50",
                                    action.kind === "status" && action.status === "canceled"
                                        ? "border border-red-200 text-red-600 hover:bg-red-50"
                                        : "border border-[#E5E3EE] text-[#6B6480] hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC] hover:text-[#6D4AFF]",
                                ].join(" "), children: updating
                                    ? t("common.loadingEllipsis")
                                    : orderActionLabel(action, t) }, orderActionKey(action)))) })) })] }), expanded && (_jsx("tr", { className: "border-b border-[#F0EEF8] bg-[#F4F3F8]/60", children: _jsx("td", { colSpan: 7, className: "px-8 py-4", children: _jsxs("div", { className: "rounded-xl border border-[#E5E3EE] bg-white p-4", children: [_jsx("p", { className: "mb-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("orders.orderItems") }), _jsx("div", { className: "space-y-2", children: order.items.map((item, i) => (_jsx(OrderItemRow, { item: item, skuLookup: skuLookup }, i))) }), _jsxs("div", { className: "mt-3 flex items-center justify-between border-t border-[#E5E3EE] pt-3 text-sm font-bold text-[#1C1B1F]", children: [_jsx("span", { children: t("orders.orderTotal") }), _jsx("span", { children: formatCents(order.total_cents) })] })] }) }) }))] }));
}
function OrderItemRow({ item, skuLookup, }) {
    const { t, formatCents } = useI18n();
    const ctx = skuLookup.get(item.sku);
    const variantLabel = formatOrderItemVariant(item.sku, skuLookup);
    return (_jsxs("div", { className: "flex items-center justify-between gap-3 text-sm", children: [_jsxs("div", { className: "flex min-w-0 items-center gap-3", children: [_jsx("div", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F3F8] text-xs font-bold text-[#6D4AFF]", children: item.sku.slice(0, 2).toUpperCase() }), _jsxs("div", { className: "min-w-0", children: [_jsx("span", { className: "block truncate font-mono text-xs font-medium text-[#1C1B1F]", children: item.sku }), ctx && (_jsxs("span", { className: "block truncate text-xs text-[#6B6480]", children: [ctx.productName, variantLabel ? ` · ${variantLabel}` : ""] })), _jsx("span", { className: "text-[#9D98B3]", children: t("orders.quantityTimes", { quantity: item.quantity }) })] })] }), _jsx("span", { className: "shrink-0 font-semibold text-[#1C1B1F]", children: formatCents(item.unit_price_cents * item.quantity) })] }));
}
