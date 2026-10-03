import { describe, expect, it } from "vitest";
import { boughtBefore, summarizeOrders } from "./support.server";

const orders = [
  { id: "o1", status: "fulfilled", total_won: 3_200_000, created_at: "2026-09-01T00:00:00Z",
    items: [{ sku_id: "SKU01", product_name: "Prada Galleria", quantity: 1 }] },
  { id: "o2", status: "canceled", total_won: 900_000, created_at: "2026-09-10T00:00:00Z",
    items: [{ sku_id: "SKU02", product_name: "Mini", quantity: 1 }] },
  { id: "o3", status: "pending", total_won: 500_000, created_at: "2026-09-20T00:00:00Z",
    items: [{ sku_id: "SKU03", quantity: 2 }] },
  { id: "o4", status: "in_transit", total_won: 1_000_000, created_at: "2026-09-15T00:00:00Z",
    items: [{ sku_id: "SKU04", product_name: "Tote", quantity: 1 }, { sku_id: "SKU05", quantity: 1 }] },
];

describe("summarizeOrders", () => {
  it("counts and sums only orders that were paid for", () => {
    const history = summarizeOrders(orders);
    expect(history.order_count).toBe(2);
    expect(history.total_spent_won).toBe(4_200_000);
  });

  it("lists every status, newest first", () => {
    const history = summarizeOrders(orders);
    expect(history.recent.map((o) => o.id)).toEqual(["o3", "o4", "o2", "o1"]);
    expect(history.recent[1]).toMatchObject({ first_item_name: "Tote", item_count: 2 });
  });

  it("keeps at most ten", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `o${i}`, status: "paid", total_won: 1, created_at: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    expect(summarizeOrders(many).recent).toHaveLength(10);
  });
});

describe("boughtBefore", () => {
  it("is true only for a SKU in a paid order", () => {
    expect(boughtBefore(orders, "SKU01")).toBe(true);
    expect(boughtBefore(orders, "SKU02")).toBe(false); // canceled
    expect(boughtBefore(orders, "SKU03")).toBe(false); // never paid
    expect(boughtBefore(orders, undefined)).toBe(false);
  });
});
