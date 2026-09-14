import { describe, expect, it } from "vitest";

import { formatCurrency, formatWon } from "./format";

describe("formatWon", () => {
  it("formats whole-won API amounts without dividing by 100", () => {
    // Order totals and product prices are whole KRW — never minor units.
    expect(formatWon("ko", 480_000)).toMatch(/480,?000/);
    expect(formatWon("en", 480_000)).toMatch(/480,?000/);
  });

  it("shows zero-decimal KRW for typical order line amounts", () => {
    expect(formatWon("ko", 30_000)).toMatch(/30,?000/);
    expect(formatWon("ko", 100)).toMatch(/100/);
  });
});

describe("formatCurrency", () => {
  it("ignores the legacy currency argument and always uses KRW", () => {
    const krw = formatCurrency("en", 2500, "USD");
    expect(krw).toMatch(/2,?500/);
    expect(krw).not.toMatch(/25/);
  });
});
