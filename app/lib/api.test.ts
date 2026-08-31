import { describe, expect, it } from "vitest";
import { type Order, orderHasFulfillment, productImageSrc } from "./api";

function order(partial: Partial<Order> & Pick<Order, "id" | "status">): Order {
  return {
    customer_id: "cust-1",
    reservation_id: "res-1",
    items: [],
    subtotal_cents: 0,
    discount_cents: 0,
    total_cents: 0,
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
    ...partial,
  };
}

describe("productImageSrc", () => {
  it("rewrites gateway absolute URLs to same-origin /product-images paths", () => {
    expect(
      productImageSrc("http://localhost:8080/product-images/p1/v0/0.jpg")
    ).toBe("/product-images/p1/v0/0.jpg");
  });

  it("preserves query strings on rewritten paths", () => {
    expect(
      productImageSrc(
        "http://localhost:8080/product-images/p1/v0/0.jpg?v=2"
      )
    ).toBe("/product-images/p1/v0/0.jpg?v=2");
  });

  it("leaves relative paths unchanged and rewrites /product-images pathname to same-origin", () => {
    expect(productImageSrc("/product-images/local.jpg")).toBe(
      "/product-images/local.jpg"
    );
    // Any host with /product-images/ pathname is rewritten for same-origin proxying.
    expect(
      productImageSrc("https://images.dupli1.com/product-images/p1.jpg")
    ).toBe("/product-images/p1.jpg");
    expect(productImageSrc("https://cdn.example.com/other/p1.jpg")).toBe(
      "https://cdn.example.com/other/p1.jpg"
    );
  });
});

describe("orderHasFulfillment", () => {
  it("is true when recipient or address snapshot fields are present", () => {
    expect(
      orderHasFulfillment(
        order({ id: "ord-1", status: "paid", recipient_name: " Kim " })
      )
    ).toBe(true);
    expect(
      orderHasFulfillment(
        order({
          id: "ord-2",
          status: "paid",
          shipping_address: {
            postal_code: "12345",
            address_line1: "123 Main",
            city: "Seoul",
            province: "Seoul",
          },
        })
      )
    ).toBe(true);
  });

  it("is false when fulfillment snapshot is empty", () => {
    expect(orderHasFulfillment(order({ id: "ord-3", status: "pending" }))).toBe(
      false
    );
    expect(
      orderHasFulfillment(
        order({
          id: "ord-4",
          status: "pending",
          recipient_name: "   ",
          shipping_address: {
            postal_code: "",
            address_line1: "  ",
            city: "",
            province: "",
          },
        })
      )
    ).toBe(false);
  });
});
