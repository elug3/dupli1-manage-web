import { describe, expect, it } from "vitest";

import {
  hideReasonError,
  hideReviewBody,
  parseStaffReviewPage,
  staffReviewQuery,
} from "./reviews";

describe("staffReviewQuery", () => {
  it("sends the staff filters and drops blanks", () => {
    expect(
      staffReviewQuery({
        status: "hidden",
        productId: "  prod 1 ",
        rating: 1,
        limit: 20,
        cursor: "abc",
      })
    ).toBe("status=hidden&productId=prod+1&rating=1&limit=20&cursor=abc");
    expect(staffReviewQuery({ productId: "  ", rating: 0 })).toBe("status=visible");
    expect(staffReviewQuery({ rating: 6 })).toBe("status=visible");
  });
});

describe("hideReasonError", () => {
  it("requires a reason only when hiding, and caps it at 200 characters", () => {
    expect(hideReasonError("  ", true)).toBe("required");
    expect(hideReasonError("마감 불량", true)).toBeNull();
    expect(hideReasonError("", false)).toBeNull();
    expect(hideReasonError("가".repeat(201), true)).toBe("tooLong");
    expect(hideReasonError("가".repeat(200), true)).toBeNull();
  });
});

describe("hideReviewBody", () => {
  it("sends the trimmed reason only when hiding", () => {
    expect(hideReviewBody(true, "  마감 불량  ")).toEqual({ hidden: true, reason: "마감 불량" });
    expect(hideReviewBody(false, "ignored")).toEqual({ hidden: false });
  });
});

describe("parseStaffReviewPage", () => {
  it("keeps staff fields and drops photos without a url", () => {
    const page = parseStaffReviewPage({
      nextCursor: "next",
      reviews: [
        {
          id: "rev_1",
          productId: "prod_mock_eco",
          skuId: "sku_eco_blk",
          variantLabel: "Black / OS",
          rating: 5,
          body: "가죽 결이 곱습니다.",
          author: "김**",
          createdAt: "2026-11-01T03:00:00Z",
          orderId: "ord_1",
          customerId: "usr_shopper",
          hidden: true,
          hiddenReason: "광고",
          photos: [
            { id: "ph1", url: "https://dupli1.com/product-images/a.jpg", thumbUrl: "https://dupli1.com/product-images/a.w400.jpg" },
            { id: "bad" },
          ],
        },
        { rating: 9 },
      ],
    });
    expect(page.nextCursor).toBe("next");
    expect(page.reviews).toHaveLength(2);
    expect(page.reviews[0]).toMatchObject({
      id: "rev_1",
      hidden: true,
      hiddenReason: "광고",
      customerId: "usr_shopper",
      photos: [
        {
          id: "ph1",
          url: "https://dupli1.com/product-images/a.jpg",
          thumbUrl: "https://dupli1.com/product-images/a.w400.jpg",
        },
      ],
    });
    expect(page.reviews[1].rating).toBe(0);
    expect(page.reviews[1].photos).toEqual([]);
    expect(parseStaffReviewPage(null)).toEqual({ reviews: [], nextCursor: "" });
  });
});
