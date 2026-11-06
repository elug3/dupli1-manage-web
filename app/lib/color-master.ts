import type { CatalogBaseColor, CatalogColor } from "~/lib/api";
import { normalizeHexInput } from "~/lib/color-swatch";

/**
 * The Colors tab's list logic: each color master row is one color with an
 * optional base color (the plain color shoppers filter by) and an optional
 * fill of its own. Backend: dupli1 docs/product-color-swatches.md.
 */

/** "unset": only colors without a base color; "all": every color. */
export type ColorFilter = "unset" | "all";

export function hasBaseColor(color: CatalogColor): boolean {
  return Boolean(color.baseCode?.trim());
}

export function countUnset(colors: CatalogColor[]): number {
  return colors.filter((c) => !hasBaseColor(c)).length;
}

/** Colors shown for a filter and a search over code and name (any case). */
export function filterColors(
  colors: CatalogColor[],
  filter: ColorFilter,
  query: string
): CatalogColor[] {
  const q = query.trim().toLowerCase();
  return colors.filter((c) => {
    if (filter === "unset" && hasBaseColor(c)) return false;
    if (!q) return true;
    return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });
}

/**
 * The next color without a base color after `afterCode`, in list order,
 * wrapping around; never `afterCode` itself. "" when none is left.
 */
export function nextUnsetCode(colors: CatalogColor[], afterCode: string): string {
  const start = colors.findIndex((c) => c.code === afterCode);
  for (let i = 1; i <= colors.length; i += 1) {
    const c = colors[(start + i) % colors.length];
    if (c.code !== afterCode && !hasBaseColor(c)) return c.code;
  }
  return "";
}

/** Shown in hue order (dark to light neutrals, then warm to cool); unknown codes after, by code. */
const BASE_ORDER = [
  "BLK", "WHT", "GRY", "SLV", "CRM", "BGE", "TAN", "BRN", "GLD",
  "YLW", "ORG", "RED", "PNK", "PRP", "NVY", "BLU", "GRN", "OLV",
];

export function orderBaseColors(bases: CatalogBaseColor[]): CatalogBaseColor[] {
  const rank = (code: string) => {
    const i = BASE_ORDER.indexOf(code);
    return i < 0 ? BASE_ORDER.length : i;
  };
  return [...bases].sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code));
}

/** Where the storefront swatch comes from: the color's own fill, else its base color's, else none. */
export type SwatchSource =
  | { kind: "own"; hex: string }
  | { kind: "base"; hex: string; base: CatalogBaseColor }
  | { kind: "none" };

export function swatchSource(
  ownHex: string,
  baseCode: string,
  bases: CatalogBaseColor[]
): SwatchSource {
  const own = normalizeHexInput(ownHex);
  if (own) return { kind: "own", hex: own };
  const base = bases.find((b) => b.code === baseCode);
  const baseHex = base ? normalizeHexInput(base.hex ?? "") : "";
  if (base && baseHex) return { kind: "base", hex: baseHex, base };
  return { kind: "none" };
}
