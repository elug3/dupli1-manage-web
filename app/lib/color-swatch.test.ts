import { describe, expect, it } from "vitest";

import { normalizeHexInput, secondColorOptions, skuSwatchPreview, swatchPreview } from "./color-swatch";

describe("normalizeHexInput", () => {
  it("normalizes what product accepts and rejects the rest", () => {
    expect(normalizeHexInput("")).toBe("");
    expect(normalizeHexInput("  ")).toBe("");
    expect(normalizeHexInput("1F2A44")).toBe("#1f2a44");
    expect(normalizeHexInput("#ABCDEF")).toBe("#abcdef");
    expect(normalizeHexInput("#abc")).toBeNull();
    expect(normalizeHexInput("navy")).toBeNull();
  });
});

describe("swatchPreview", () => {
  it("previews solid and none like the storefront", () => {
    expect(swatchPreview("#0a0a0a")).toEqual({ kind: "solid", style: { backgroundColor: "#0a0a0a" } });
    expect(swatchPreview("6B4226")).toEqual({ kind: "solid", style: { backgroundColor: "#6b4226" } });
    expect(swatchPreview("")).toEqual({ kind: "none" });
    expect(swatchPreview("bad")).toEqual({ kind: "none" });
  });
});

describe("skuSwatchPreview", () => {
  it("draws a two-color SKU as a diagonal two-tone", () => {
    expect(skuSwatchPreview("#0a0a0a", "#6b4226")).toEqual({
      kind: "two-tone",
      style: { background: "linear-gradient(135deg, #0a0a0a 50%, #6b4226 50%)" },
    });
    expect(skuSwatchPreview("#0a0a0a")).toEqual({ kind: "solid", style: { backgroundColor: "#0a0a0a" } });
    expect(skuSwatchPreview(undefined, "#6b4226")).toEqual({ kind: "none" });
  });
});

describe("secondColorOptions", () => {
  it("offers every color but the first", () => {
    const colors = [{ code: "1081" }, { code: "BLK" }, { code: "BRN" }];
    expect(secondColorOptions(colors, "1081").map((c) => c.code)).toEqual(["BLK", "BRN"]);
  });
});
