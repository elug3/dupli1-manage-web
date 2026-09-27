import { describe, expect, it } from "vitest";
import type { Order } from "./api";
import {
  applyOrderToAttention,
  attentionFor,
  attentionFromOrders,
  badgeLabel,
} from "./order-attention";

const NOW = new Date("2026-09-27T12:00:00Z").getTime();
const inMinutes = (m: number) => new Date(NOW + m * 60_000).toISOString();

function order(partial: Partial<Order> & Pick<Order, "id" | "status">): Order {
  return {
    customer_id: "cust-1",
    reservation_id: "res-1",
    items: [],
    subtotal_won: 0,
    discount_won: 0,
    total_won: 0,
    created_at: "2026-09-27T10:00:00Z",
    updated_at: "2026-09-27T10:00:00Z",
    ...partial,
  };
}

describe("attentionFor", () => {
  it("flags a paid order for confirmation with its SLA", () => {
    const item = attentionFor(
      order({ id: "o1", status: "paid", confirmation_due_at: inMinutes(30) }),
      NOW
    );
    expect(item).toMatchObject({ kind: "confirm", overdue: false });
    expect(item?.dueAt).toBe(inMinutes(30));
  });

  it("marks a passed deadline or the server's overdue flag as overdue", () => {
    expect(
      attentionFor(order({ id: "o1", status: "paid", confirmation_due_at: inMinutes(-1) }), NOW)
        ?.overdue
    ).toBe(true);
    expect(
      attentionFor(order({ id: "o1", status: "paid", confirmation_overdue: true }), NOW)?.overdue
    ).toBe(true);
  });

  it("flags an open cancel request, but not once the order is canceled", () => {
    const requested = order({
      id: "o2",
      status: "in_transit",
      cancel_requested_at: inMinutes(-10),
      cancel_confirm_due_at: inMinutes(110),
    });
    expect(attentionFor(requested, NOW)).toMatchObject({ kind: "cancel", overdue: false });
    expect(attentionFor({ ...requested, status: "canceled" }, NOW)).toBeNull();
  });

  it("flags disputes and ignores everything else", () => {
    expect(attentionFor(order({ id: "o3", status: "disputed" }), NOW)?.kind).toBe("dispute");
    for (const status of ["pending", "confirmed", "in_transit", "delivered", "fulfilled", "canceled"] as const) {
      expect(attentionFor(order({ id: "x", status }), NOW)).toBeNull();
    }
  });
});

describe("attention list", () => {
  it("sorts overdue first, then by soonest deadline", () => {
    const items = attentionFromOrders(
      [
        order({ id: "later", status: "paid", confirmation_due_at: inMinutes(90) }),
        order({ id: "dispute", status: "disputed" }),
        order({ id: "late", status: "paid", confirmation_due_at: inMinutes(-5) }),
        order({ id: "soon", status: "paid", confirmation_due_at: inMinutes(10) }),
      ],
      NOW
    );
    expect(items.map((i) => i.order.id)).toEqual(["late", "soon", "later", "dispute"]);
  });

  it("adds, replaces and drops an order as it changes", () => {
    const paid = order({ id: "o1", status: "paid", confirmation_due_at: inMinutes(30) });
    let items = applyOrderToAttention([], paid, NOW);
    expect(items).toHaveLength(1);
    items = applyOrderToAttention(items, paid, NOW);
    expect(items).toHaveLength(1);
    items = applyOrderToAttention(items, { ...paid, status: "confirmed" }, NOW);
    expect(items).toHaveLength(0);
  });

  it("caps the badge", () => {
    expect(badgeLabel(7)).toBe("7");
    expect(badgeLabel(120)).toBe("99+");
  });
});
