import type { CSSProperties } from "react";

/**
 * Color master swatch helpers. The storefront draws a color from `hex`, splits
 * it on the diagonal with `hex2` for a two-tone color, and shows a dashed
 * neutral circle when there is no `hex` (backend dupli1
 * docs/product-color-swatches.md). The preview here matches that.
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

export type SwatchPreview =
  | { kind: "solid"; style: CSSProperties }
  | { kind: "two-tone"; style: CSSProperties }
  | { kind: "none" };

/** How the storefront will draw these fills; invalid input previews as none. */
export function swatchPreview(hex: string, hex2: string): SwatchPreview {
  const first = normalizeHexInput(hex);
  if (!first) return { kind: "none" };
  const second = normalizeHexInput(hex2);
  if (second) {
    return {
      kind: "two-tone",
      style: { background: `linear-gradient(135deg, ${first} 50%, ${second} 50%)` },
    };
  }
  return { kind: "solid", style: { backgroundColor: first } };
}
