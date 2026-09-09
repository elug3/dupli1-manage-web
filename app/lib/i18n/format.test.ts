import { describe, expect, it } from "vitest";
import { formatCents, formatCurrency } from "./format";

describe("formatCurrency / formatCents (KRW whole won)", () => {
  it("formats whole KRW amounts without dividing by 100", () => {
    // Regression: USD-style ÷100 showed ₩180 for an ₩18,000 order total.
    expect(formatCents("ko", 18_000)).toMatch(/18[, ]?000/);
    expect(formatCents("ko", 18_000)).not.toMatch(/180[^0]|₩180$/);
  });

  it("uses zero decimal places for typical order line amounts", () => {
    expect(formatCurrency("en", 3_000)).toMatch(/3[, ]?000/);
    expect(formatCents("en", 45_000)).toMatch(/45[, ]?000/);
  });

  it("formats zero and small whole-won values", () => {
    expect(formatCents("ko", 0)).toMatch(/0/);
    expect(formatCents("ko", 100)).toMatch(/100/);
  });
});
