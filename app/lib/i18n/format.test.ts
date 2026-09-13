import { describe, expect, it } from "vitest";

import { formatCurrency, formatKrw } from "./format";

describe("formatKrw", () => {
  it("formats whole-won API amounts without dividing by 100", () => {
    // Order totals and product prices are whole KRW — never minor units.
    expect(formatKrw("ko", 480_000)).toMatch(/480,?000/);
    expect(formatKrw("en", 480_000)).toMatch(/480,?000/);
  });

  it("shows zero-decimal KRW for typical order line amounts", () => {
    expect(formatKrw("ko", 30_000)).toMatch(/30,?000/);
    expect(formatKrw("ko", 100)).toMatch(/100/);
  });
});

describe("formatCurrency", () => {
  it("ignores the legacy currency argument and always uses KRW", () => {
    const krw = formatCurrency("en", 2500, "USD");
    expect(krw).toMatch(/2,?500/);
    expect(krw).not.toMatch(/25/);
  });
});
