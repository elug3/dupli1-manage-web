import { describe, expect, it } from "vitest";

import type { CatalogBaseColor, CatalogColor } from "./api";
import {
  countUnset,
  filterColors,
  nextUnsetCode,
  orderBaseColors,
  swatchSource,
} from "./color-master";

const colors: CatalogColor[] = [
  { code: "1139", name: "블랙", baseCode: "BLK" },
  { code: "9678", name: "쇼어" },
  { code: "F0384", name: "오팔린", baseCode: "" },
  { code: "OCE", name: "Ocean/Pacific", baseCode: "BLU" },
  { code: "LUN", name: "Lunar" },
];

const bases: CatalogBaseColor[] = [
  { code: "BLU", name: "Blue", hex: "#2f5d9a" },
  { code: "BLK", name: "Black", hex: "#0a0a0a" },
  { code: "ZZZ", name: "Unlisted" },
  { code: "WHT", name: "White", hex: "#ffffff" },
];

describe("filterColors", () => {
  it("keeps only colors without a base color for unset", () => {
    expect(filterColors(colors, "unset", "").map((c) => c.code)).toEqual(["9678", "F0384", "LUN"]);
    expect(countUnset(colors)).toBe(3);
  });

  it("searches code and name, any case", () => {
    expect(filterColors(colors, "all", "oce").map((c) => c.code)).toEqual(["OCE"]);
    expect(filterColors(colors, "all", " 블랙 ").map((c) => c.code)).toEqual(["1139"]);
    expect(filterColors(colors, "unset", "pacific")).toEqual([]);
  });
});

describe("nextUnsetCode", () => {
  it("moves to the next color without a base, wrapping around", () => {
    expect(nextUnsetCode(colors, "9678")).toBe("F0384");
    expect(nextUnsetCode(colors, "LUN")).toBe("9678");
    expect(nextUnsetCode(colors, "1139")).toBe("9678");
  });

  it("is empty when no other color is left", () => {
    expect(nextUnsetCode([{ code: "LUN", name: "Lunar" }], "LUN")).toBe("");
    expect(nextUnsetCode([], "LUN")).toBe("");
  });
});

describe("orderBaseColors", () => {
  it("orders by hue, unknown codes last", () => {
    expect(orderBaseColors(bases).map((b) => b.code)).toEqual(["BLK", "WHT", "BLU", "ZZZ"]);
  });
});

describe("swatchSource", () => {
  it("uses the own fill first, then the base color's, else none", () => {
    expect(swatchSource("#111111", "BLK", bases)).toEqual({ kind: "own", hex: "#111111" });
    expect(swatchSource("", "BLU", bases)).toEqual({ kind: "base", hex: "#2f5d9a", base: bases[0] });
    expect(swatchSource("", "ZZZ", bases)).toEqual({ kind: "none" });
    expect(swatchSource("", "", bases)).toEqual({ kind: "none" });
    expect(swatchSource("bad", "", bases)).toEqual({ kind: "none" });
  });
});
