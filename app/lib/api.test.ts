import { describe, expect, it } from "vitest";
import { orderHasFulfillment, productImageSrc, type Order } from "./api";

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord-1",
    customer_id: "cust-1",
    reservation_id: "res-1",
    items: [],
    status: "paid",
    subtotal_cents: 1000,
    discount_cents: 0,
    total_cents: 1000,
    ...overrides,
  };
}

describe("orderHasFulfillment", () => {
  it("is true when any fulfillment snapshot field is present", () => {
    expect(orderHasFulfillment(baseOrder({ recipient_name: "윤라희" }))).toBe(true);
    expect(orderHasFulfillment(baseOrder({ recipient_phone: "01041125167" }))).toBe(true);
    expect(
      orderHasFulfillment(
        baseOrder({
          shipping_address: {
            postal_code: "06236",
            address_line1: "테헤란로 123",
            city: "서울",
            province: "서울특별시",
          },
        })
      )
    ).toBe(true);
    expect(
      orderHasFulfillment(
        baseOrder({
          shipping_address: {
            postal_code: "06236",
            address_line1: "",
            city: "서울",
            province: "서울특별시",
          },
        })
      )
    ).toBe(true);
  });

  it("is false when every snapshot field is blank", () => {
    expect(orderHasFulfillment(baseOrder())).toBe(false);
    expect(
      orderHasFulfillment(
        baseOrder({
          recipient_name: "   ",
          recipient_phone: "",
          shipping_address: {
            postal_code: " ",
            address_line1: "",
            city: "서울",
            province: "서울특별시",
          },
        })
      )
    ).toBe(false);
  });
});

describe("productImageSrc", () => {
  it("rewrites gateway product-images URLs to same-origin paths", () => {
    expect(
      productImageSrc("http://localhost:8080/product-images/parent/0.jpg?x=1")
    ).toBe("/product-images/parent/0.jpg?x=1");
  });

  it("passes through relative paths and external CDN URLs unchanged", () => {
    expect(productImageSrc("/product-images/local.jpg")).toBe("/product-images/local.jpg");
    expect(productImageSrc("https://images.dupli1.com/parent/0.jpg")).toBe(
      "https://images.dupli1.com/parent/0.jpg"
    );
    expect(productImageSrc("")).toBe("");
  });
});
