import { describe, expect, it } from "vitest";
import type { Promotion } from "./api";
import {
  buildPromotionInput,
  effectiveBenefit,
  emptyPromotionForm,
  CONDITION_ATTRS,
  expiresOnFromISO,
  isLivePromotion,
  opsForKind,
  promotionToForm,
} from "./promotions";

function promotion(partial: Partial<Promotion> & Pick<Promotion, "code">): Promotion {
  return {
    scope: "global",
    description: "",
    active: true,
    conditions: { version: 0 },
    benefit: {
      target: "goods",
      discount_type: "percent",
      discount_fraction: 0.3,
      apply_to: "entire_subtotal",
    },
    max_per_customer: 1,
    redemption_count: 0,
    discount: 0,
    expires: "",
    ...partial,
  };
}

describe("buildPromotionInput", () => {
  it("turns a percentage into a fraction the service accepts", () => {
    const form = { ...emptyPromotionForm(), code: "summer30", percent: "30" };
    const { input, errorKey } = buildPromotionInput(form, { includeCode: true });
    expect(errorKey).toBeUndefined();
    expect(input?.code).toBe("SUMMER30");
    expect(input?.benefit).toEqual({
      target: "goods",
      discount_type: "percent",
      apply_to: "entire_subtotal",
      discount_fraction: 0.3,
    });
  });

  it("refuses a percentage the service would reject on write", () => {
    const form = { ...emptyPromotionForm(), code: "X", percent: "100" };
    expect(buildPromotionInput(form, { includeCode: true }).errorKey).toBe(
      "promotions.errPercentRange"
    );
    expect(
      buildPromotionInput(
        { ...emptyPromotionForm(), code: "X", percent: "0" },
        { includeCode: true }
      ).errorKey
    ).toBe("promotions.errPercentRange");
  });

  it("sends a fixed benefit in whole won, with no stray fraction", () => {
    const form = {
      ...emptyPromotionForm(),
      code: "WELCOME50",
      discountType: "fixed" as const,
      fixedWon: "50000",
    };
    const { input } = buildPromotionInput(form, { includeCode: true });
    expect(input?.benefit?.discount_fixed_won).toBe(50000);
    expect(input?.benefit?.discount_fraction).toBeUndefined();
  });

  it("refuses a fractional won amount", () => {
    const form = {
      ...emptyPromotionForm(),
      code: "X",
      discountType: "fixed" as const,
      fixedWon: "5000.5",
    };
    expect(buildPromotionInput(form, { includeCode: true }).errorKey).toBe(
      "promotions.errFixedAmount"
    );
  });

  it("builds the sign-up campaign shape: fixed won plus a minimum spend", () => {
    const form = {
      ...emptyPromotionForm(),
      code: "WELCOME50",
      scope: "single_user" as const,
      discountType: "fixed" as const,
      fixedWon: "50000",
      conditions: [{ attr: "subtotal_won", op: "gte" as const, value: "100000" }],
    };
    const { input } = buildPromotionInput(form, { includeCode: true });
    expect(input?.scope).toBe("single_user");
    expect(input?.conditions).toEqual({
      version: 1,
      all: [{ attr: "subtotal_won", op: "gte", value: 100000 }],
    });
  });

  it("omits line_match when no line condition uses it", () => {
    const form = {
      ...emptyPromotionForm(),
      code: "X",
      percent: "10",
      conditions: [{ attr: "subtotal_won", op: "gte" as const, value: "1000" }],
    };
    const { input } = buildPromotionInput(form, { includeCode: true });
    expect(input?.conditions?.line_match).toBeUndefined();
  });

  it("sends line_match once a line condition is present", () => {
    const form = {
      ...emptyPromotionForm(),
      code: "X",
      percent: "10",
      lineMatch: "all" as const,
      conditions: [{ attr: "line.brandCode", op: "in" as const, value: "PRADA, GUCCI" }],
    };
    const { input } = buildPromotionInput(form, { includeCode: true });
    expect(input?.conditions?.all).toEqual([
      { attr: "line.brandCode", op: "in", value: ["PRADA", "GUCCI"] },
    ]);
    expect(input?.conditions?.line_match).toBe("all");
  });

  it("writes the on-sale exclusion as an exclude predicate", () => {
    const form = {
      ...emptyPromotionForm(),
      code: "X",
      percent: "10",
      excludeOnSale: true,
    };
    const { input } = buildPromotionInput(form, { includeCode: true });
    expect(input?.conditions?.exclude).toEqual([
      { attr: "line.on_sale", op: "eq", value: true },
    ]);
  });

  it("sends an empty document when there are no rules at all", () => {
    const form = { ...emptyPromotionForm(), code: "X", percent: "10" };
    const { input } = buildPromotionInput(form, { includeCode: true });
    expect(input?.conditions).toEqual({ version: 0 });
  });

  it("needs a value on every condition", () => {
    const form = {
      ...emptyPromotionForm(),
      code: "X",
      percent: "10",
      conditions: [{ attr: "subtotal_won", op: "gte" as const, value: "  " }],
    };
    expect(buildPromotionInput(form, { includeCode: true }).errorKey).toBe(
      "promotions.errConditionValue"
    );
  });

  it("sends an empty expires_on to clear an expiry", () => {
    const form = { ...emptyPromotionForm(), percent: "10" };
    const { input } = buildPromotionInput(form, { includeCode: false });
    expect(input?.expires_on).toBe("");
    expect(input?.code).toBeUndefined();
  });

  it("requires a code only when creating", () => {
    const form = { ...emptyPromotionForm(), percent: "10" };
    expect(buildPromotionInput(form, { includeCode: true }).errorKey).toBe(
      "promotions.errCodeRequired"
    );
    expect(buildPromotionInput(form, { includeCode: false }).errorKey).toBeUndefined();
  });
});

describe("promotionToForm", () => {
  it("round-trips a fixed-won campaign with a minimum spend", () => {
    const original = promotion({
      code: "WELCOME50",
      scope: "single_user",
      benefit: {
        target: "goods",
        discount_type: "fixed",
        discount_fixed_won: 50000,
        apply_to: "entire_subtotal",
      },
      conditions: {
        version: 1,
        all: [{ attr: "subtotal_won", op: "gte", value: 100000 }],
      },
    });
    const form = promotionToForm(original);
    expect(form.discountType).toBe("fixed");
    expect(form.fixedWon).toBe("50000");
    expect(form.conditions).toEqual([
      { attr: "subtotal_won", op: "gte", value: "100000" },
    ]);

    const { input } = buildPromotionInput(form, { includeCode: false });
    expect(input?.benefit).toEqual(original.benefit);
    expect(input?.conditions).toEqual(original.conditions);
  });

  it("shows a pre-Phase-2 row through its legacy percentage column", () => {
    const form = promotionToForm(
      promotion({
        code: "SUMMER30",
        discount: 0.3,
        benefit: { target: "", discount_type: "" } as never,
      })
    );
    expect(form.discountType).toBe("percent");
    expect(form.percent).toBe("30");
  });

  it("reads a list predicate back as comma-separated text", () => {
    const form = promotionToForm(
      promotion({
        code: "X",
        conditions: {
          version: 1,
          all: [{ attr: "line.category", op: "in", value: ["bags", "wallets"] }],
          line_match: "any",
        },
      })
    );
    expect(form.conditions[0].value).toBe("bags, wallets");
  });
});

describe("expiresOnFromISO", () => {
  it("reads an end-of-day KST expiry back as the day the manager picked", () => {
    // 2026-08-31 23:59:59 KST is 14:59:59Z the same day — rendering it in UTC
    // would be right here but wrong for any instant past 15:00Z.
    expect(expiresOnFromISO("2026-08-31T14:59:59Z")).toBe("2026-08-31");
    expect(expiresOnFromISO("2026-08-31T15:30:00Z")).toBe("2026-09-01");
  });

  it("is empty for a code that never expires", () => {
    expect(expiresOnFromISO(null)).toBe("");
    expect(expiresOnFromISO(undefined)).toBe("");
  });
});

describe("effectiveBenefit", () => {
  it("prefers the stored benefit over the legacy column", () => {
    const benefit = effectiveBenefit(
      promotion({ code: "X", discount: 0.1 })
    );
    expect(benefit?.discount_fraction).toBe(0.3);
  });

  it("is null for a row with neither", () => {
    expect(
      effectiveBenefit(
        promotion({ code: "X", discount: 0, benefit: {} as never })
      )
    ).toBeNull();
  });
});

describe("opsForKind", () => {
  it("offers ordering comparisons only on numbers", () => {
    expect(opsForKind("number")).toContain("gte");
    expect(opsForKind("string")).not.toContain("gte");
    expect(opsForKind("boolean")).toEqual(["eq", "neq"]);
  });
});

describe("isLivePromotion", () => {
  it("is live once the ledger records a use", () => {
    expect(isLivePromotion(promotion({ code: "X" }))).toBe(false);
    expect(isLivePromotion(promotion({ code: "X", redemption_count: 2 }))).toBe(
      true
    );
  });
});

describe("CONDITION_ATTRS", () => {
  // The picker used to offer customer.paid_order_count, which no checkout
  // supplies: a code carrying it was refused on every cart. Dropped from the
  // service's allowlist and from here on 2026-09-21.
  it("offers only attributes the evaluator can satisfy", () => {
    expect(CONDITION_ATTRS.map((a) => a.attr)).not.toContain(
      "customer.paid_order_count"
    );
  });
});
