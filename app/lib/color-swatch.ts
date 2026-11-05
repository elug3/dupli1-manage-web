import type { CSSProperties } from "react";

/**
 * Color master swatch helpers. A color master row is one color: the
 * storefront draws it solid from `hex`, and shows a dashed neutral circle
 * when there is no `hex` (backend dupli1 docs/product-color-swatches.md).
 * The preview here matches that.
 */

const HEX = /^#?([0-9a-f]{6})$/i;

/**
 * What an operator typed, as product stores it: "" stays "" (no color),
 * "1F2A44" or "#1f2a44" become "#1f2a44", anything else is `null` (invalid).
 */
export function normalizeHexInput(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  const match = HEX.exec(trimmed);
  return match ? `#${match[1].toLowerCase()}` : null;
}

export type SwatchPreview = { kind: "solid"; style: CSSProperties } | { kind: "none" };

/** How the storefront will draw this fill; invalid input previews as none. */
export function swatchPreview(hex: string): SwatchPreview {
  const fill = normalizeHexInput(hex);
  if (!fill) return { kind: "none" };
  return { kind: "solid", style: { backgroundColor: fill } };
}

/**
 * A SKU's swatch as the storefront draws it from the variant read's
 * `colorHex` / `colorHex2`: solid, a diagonal two-tone for a two-color SKU,
 * or the dashed "no color" circle.
 */
export type SkuSwatchPreview =
  | { kind: "solid"; style: CSSProperties }
  | { kind: "two-tone"; style: CSSProperties }
  | { kind: "none" };

export function skuSwatchPreview(colorHex?: string, colorHex2?: string): SkuSwatchPreview {
  const first = normalizeHexInput(colorHex ?? "");
  if (!first) return { kind: "none" };
  const second = normalizeHexInput(colorHex2 ?? "");
  if (second) {
    return {
      kind: "two-tone",
      style: { background: `linear-gradient(135deg, ${first} 50%, ${second} 50%)` },
    };
  }
  return { kind: "solid", style: { backgroundColor: first } };
}

/** Colors a SKU may take as its second color: every color but its first. */
export function secondColorOptions<T extends { code: string }>(colors: T[], firstColorCode: string): T[] {
  return colors.filter((c) => c.code !== firstColorCode);
}
