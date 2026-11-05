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
