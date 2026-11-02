import { describe, expect, it } from "vitest";

import { normalizeHexInput, swatchPreview } from "./color-swatch";

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
  it("previews solid, two-tone and none like the storefront", () => {
    expect(swatchPreview("#0a0a0a", "")).toEqual({ kind: "solid", style: { backgroundColor: "#0a0a0a" } });
    expect(swatchPreview("#0a0a0a", "6B4226")).toEqual({
      kind: "two-tone",
      style: { background: "linear-gradient(135deg, #0a0a0a 50%, #6b4226 50%)" },
    });
    expect(swatchPreview("", "#6b4226")).toEqual({ kind: "none" });
    expect(swatchPreview("bad", "")).toEqual({ kind: "none" });
  });
});
