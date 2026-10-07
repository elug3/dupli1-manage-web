import { describe, expect, it } from "vitest";
import {
  type Order,
  conversionRate,
  orderHasFulfillment,
  parseVariantPriceInput,
  permissionGrants,
  productImageSrc,
} from "./api";

function order(partial: Partial<Order> & Pick<Order, "id" | "status">): Order {
  return {
    customer_id: "cust-1",
    reservation_id: "res-1",
    items: [],
    subtotal_won: 0,
    discount_won: 0,
    total_won: 0,
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

describe("permissionGrants", () => {
  // Mirrors shared/pkg/permissions Has, which decides what an API key may be
  // scoped to — the key panel offers only what the account holds.
  it("matches exact, resource-wildcard, admin.* and owner grants", () => {
    expect(permissionGrants(["order.ship"], "order.ship")).toBe(true);
    expect(permissionGrants(["order.ship"], "order.read.all")).toBe(false);
    expect(permissionGrants(["product.*"], "product.variant.create")).toBe(true);
    expect(permissionGrants(["product.*"], "promotion.read")).toBe(false);
    expect(permissionGrants(["admin.*"], "user.apikey.manage")).toBe(true);
    expect(permissionGrants(["admin.*"], "order.ship")).toBe(false);
    expect(permissionGrants(["*"], "payment.cancel")).toBe(true);
    expect(permissionGrants([], "order.ship")).toBe(false);
  });
});

describe("conversionRate", () => {
  it("is paid orders per unique visitor, as a percentage", () => {
    expect(conversionRate(3, 200)).toBeCloseTo(1.5);
  });

  it("has no rate without visitors", () => {
    expect(conversionRate(3, 0)).toBeNull();
  });
});

describe("parseVariantPriceInput", () => {
  it("treats blank as inherit", () => {
    expect(parseVariantPriceInput("")).toEqual({ value: null });
    expect(parseVariantPriceInput("  ")).toEqual({ value: null });
  });

  it("accepts whole won, with thousands separators", () => {
    expect(parseVariantPriceInput("380000")).toEqual({ value: 380000 });
    expect(parseVariantPriceInput("380,000")).toEqual({ value: 380000 });
  });

  it("rejects zero, negatives and fractions (the API reads 0 as clear)", () => {
    for (const bad of ["0", "-5", "10.5", "abc", "1e5"]) {
      expect(parseVariantPriceInput(bad)).toEqual({ error: "INVALID_PRICE" });
    }
  });
});
