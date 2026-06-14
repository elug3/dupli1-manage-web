import { useEffect, useState } from "react";
import {
  type Order,
  type OrderStatus,
  getOrders,
  updateOrderStatus,
} from "~/lib/api";
import { OrderStatusBadge } from "./dashboard";

export function meta() {
  return [{ title: "Orders | Schick Admin" }];
}

const STATUS_TABS: { label: string; value: OrderStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Processing", value: "processing" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
];

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrderStatus | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    getOrders()
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    activeTab === "all"
      ? orders
      : orders.filter((o) => o.status === activeTab);

  const counts = orders.reduce(
    (acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<OrderStatus, number>
  );

  async function handleStatusChange(order: Order, newStatus: OrderStatus) {
    setUpdatingId(order.id);
    try {
      await updateOrderStatus(order.id, newStatus).catch(() => {});
      setOrders((os) =>
        os.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o))
      );
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1C1B1F]">Orders</h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">
            {orders.length} orders total
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#E5E3EE] bg-white px-4 py-2.5 text-sm text-[#6B6480] shadow-[0_1px_3px_rgba(28,27,31,0.04)]">
          <svg className="size-4" viewBox="0 0 24 24" fill="none">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Export CSV
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-[#E5E3EE] bg-white p-1 shadow-[0_1px_3px_rgba(28,27,31,0.04)] w-fit">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.value === "all"
              ? orders.length
              : (counts[tab.value] ?? 0);
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={[
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                activeTab === tab.value
                  ? "bg-[#6D4AFF] text-white shadow-sm"
                  : "text-[#6B6480] hover:bg-[#F4F3F8] hover:text-[#1C1B1F]",
              ].join(" ")}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={[
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    activeTab === tab.value
                      ? "bg-white/20 text-white"
                      : "bg-[#F4F3F8] text-[#6B6480]",
                  ].join(" ")}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Orders table */}
      <div className="rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F0EEF8] bg-[#FAFAFA]">
                  {[
                    "Order ID",
                    "Customer",
                    "Items",
                    "Total",
                    "Status",
                    "Date",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#9D98B3]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-16 text-center text-[#9D98B3]"
                    >
                      No orders in this status
                    </td>
                  </tr>
                ) : (
                  filtered.map((order) => (
                    <OrderRows
                      key={order.id}
                      order={order}
                      expanded={expandedId === order.id}
                      updating={updatingId === order.id}
                      onToggle={() =>
                        setExpandedId(
                          expandedId === order.id ? null : order.id
                        )
                      }
                      onStatusChange={(s) => handleStatusChange(order, s)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function OrderRows({
  order,
  expanded,
  updating,
  onToggle,
  onStatusChange,
}: {
  order: Order;
  expanded: boolean;
  updating: boolean;
  onToggle: () => void;
  onStatusChange: (s: OrderStatus) => void;
}) {
  const transitions = STATUS_TRANSITIONS[order.status];

  return (
    <>
      <tr
        className={[
          "border-b border-[#F0EEF8] cursor-pointer transition-colors",
          expanded ? "bg-[#F8F7FC]" : "hover:bg-[#FAFAFA]",
        ].join(" ")}
        onClick={onToggle}
      >
        <td className="px-5 py-3.5">
          <span className="font-mono text-xs font-semibold text-[#1C1B1F]">
            {order.id}
          </span>
        </td>
        <td className="px-5 py-3.5 text-[#1C1B1F]">
          {order.customerEmail}
        </td>
        <td className="px-5 py-3.5 text-[#6B6480]">
          {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
        </td>
        <td className="px-5 py-3.5 font-semibold text-[#1C1B1F]">
          ${order.total.toFixed(0)}
        </td>
        <td className="px-5 py-3.5">
          <OrderStatusBadge status={order.status} />
        </td>
        <td className="px-5 py-3.5 text-[#9D98B3] text-xs">
          {new Date(order.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </td>
        <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
          {transitions.length > 0 && (
            <div className="flex items-center justify-end gap-1">
              {transitions.map((next) => (
                <button
                  key={next}
                  disabled={updating}
                  onClick={() => onStatusChange(next)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition disabled:opacity-50",
                    next === "cancelled"
                      ? "border border-red-200 text-red-600 hover:bg-red-50"
                      : "border border-[#E5E3EE] text-[#6B6480] hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC] hover:text-[#6D4AFF]",
                  ].join(" ")}
                >
                  {updating ? "…" : `→ ${next}`}
                </button>
              ))}
            </div>
          )}
        </td>
      </tr>

      {/* Expanded order detail */}
      {expanded && (
        <tr className="border-b border-[#F0EEF8] bg-[#F4F3F8]/60">
          <td colSpan={7} className="px-8 py-4">
            <div className="rounded-xl border border-[#E5E3EE] bg-white p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
                Order items
              </p>
              <div className="space-y-2">
                {order.items.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F3F8] text-xs font-bold text-[#6D4AFF]">
                        {item.productName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-medium text-[#1C1B1F]">
                          {item.productName}
                        </span>
                        <span className="ml-2 text-[#9D98B3]">
                          × {item.quantity}
                        </span>
                      </div>
                    </div>
                    <span className="font-semibold text-[#1C1B1F]">
                      ${item.price.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[#E5E3EE] pt-3 text-sm font-bold text-[#1C1B1F]">
                <span>Order total</span>
                <span>${order.total.toFixed(0)}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
