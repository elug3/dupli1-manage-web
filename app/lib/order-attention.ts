import type { Order } from "~/lib/api";

/**
 * What an order is waiting on an operator for — the header badge counts these.
 *
 * - `confirm`: paid and not yet accepted. Auto-confirms after the 2-hour SLA
 *   (`confirmation_due_at`), so this is the one that ages fastest.
 * - `cancel`: the customer asked to cancel after confirmation; approve or
 *   reject within the same 2-hour SLA (`cancel_confirm_due_at`). Rejecting
 *   clears `cancel_requested_at`; approving ends the order `canceled`.
 * - `dispute`: the customer reported non-receipt; resolve or refund.
 */
export type AttentionKind = "confirm" | "cancel" | "dispute";

export interface AttentionItem {
  order: Order;
  kind: AttentionKind;
  /** When the SLA acts on its own, if this kind has one. */
  dueAt?: string;
  overdue: boolean;
}

function isPast(at: string | undefined, now: number): boolean {
  if (!at) return false;
  const time = new Date(at).getTime();
  return Number.isFinite(time) && time <= now;
}

export function attentionFor(order: Order, now = Date.now()): AttentionItem | null {
  if (order.cancel_requested_at && order.status !== "canceled") {
    return {
      order,
      kind: "cancel",
      dueAt: order.cancel_confirm_due_at,
      overdue:
        Boolean(order.cancel_confirm_overdue) ||
        isPast(order.cancel_confirm_due_at, now),
    };
  }
  if (order.status === "paid") {
    return {
      order,
      kind: "confirm",
      dueAt: order.confirmation_due_at,
      overdue:
        Boolean(order.confirmation_overdue) ||
        isPast(order.confirmation_due_at, now),
    };
  }
  if (order.status === "disputed") {
    return { order, kind: "dispute", overdue: false };
  }
  return null;
}

/** Overdue first, then soonest deadline, then newest; stable for equal keys. */
export function sortAttention(items: AttentionItem[]): AttentionItem[] {
  const due = (item: AttentionItem) =>
    item.dueAt ? new Date(item.dueAt).getTime() : Number.POSITIVE_INFINITY;
  return items.slice().sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (due(a) !== due(b)) return due(a) - due(b);
    return (
      new Date(b.order.created_at).getTime() -
      new Date(a.order.created_at).getTime()
    );
  });
}

export function attentionFromOrders(orders: Order[], now = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const order of orders) {
    const item = attentionFor(order, now);
    if (item) items.push(item);
  }
  return sortAttention(items);
}

/**
 * Fold one changed order into the list: add or replace it while it still needs
 * an operator, drop it once it does not. Idempotent.
 */
export function applyOrderToAttention(
  items: AttentionItem[],
  order: Order,
  now = Date.now()
): AttentionItem[] {
  const rest = items.filter((item) => item.order.id !== order.id);
  const item = attentionFor(order, now);
  return item ? sortAttention([...rest, item]) : rest;
}

/** Badge text: the count, capped like most consoles. */
export function badgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}
