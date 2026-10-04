// Product categories (bags, clothing) and the clothing size chart.
// Pure helpers only — the fetches live in api.ts.

export interface CategoryTerm {
  code: string;
  name: string;
}

/** `GET /api/v1/products/catalog/categories` row. */
export interface ProductCategory {
  code: string;
  name: string;
  subCategories: CategoryTerm[];
  /** Size master codes its variants may use, in display order. Absent = any size. */
  sizes?: string[];
}

/** What a product without a category is (rows written before categories were checked). */
export const DEFAULT_CATEGORY = "bags";
export const CLOTHING_CATEGORY = "clothing";

/** Used until `/catalog/categories` answers, or when it cannot. */
export const FALLBACK_CATEGORIES: ProductCategory[] = [
  { code: DEFAULT_CATEGORY, name: "Bags", subCategories: [] },
];

function terms(raw: unknown): CategoryTerm[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    if (typeof r.code !== "string" || !r.code) return [];
    return [{ code: r.code, name: typeof r.name === "string" && r.name ? r.name : r.code }];
  });
}

export function mapCategories(raw: unknown): ProductCategory[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { results?: unknown }).results)
      ? (raw as { results: unknown[] }).results
      : [];
  return rows.flatMap((row) => {
    const [base] = terms([row]);
    if (!base) return [];
    const r = row as Record<string, unknown>;
    const sizes = Array.isArray(r.sizes)
      ? r.sizes.filter((s): s is string => typeof s === "string" && s !== "")
      : [];
    return [
      {
        ...base,
        subCategories: terms(r.subCategories),
        ...(sizes.length > 0 ? { sizes } : {}),
      },
    ];
  });
}

export function normalizeCategory(code: string | undefined | null): string {
  return (code ?? "").trim().toLowerCase() || DEFAULT_CATEGORY;
}

export function findCategory(
  categories: ProductCategory[],
  code: string | undefined | null
): ProductCategory | undefined {
  const n = normalizeCategory(code);
  return categories.find((c) => c.code === n);
}

/** Categories with a translated name (`products.category_<code>`). */
const LOCALIZED_CATEGORIES = new Set(["bags", "clothing"]);

/** Display name: translated when known, else the backend's name, else the code. */
export function categoryLabel(
  code: string | undefined | null,
  categories: ProductCategory[],
  t: (key: string) => string
): string {
  const n = normalizeCategory(code);
  if (LOCALIZED_CATEGORIES.has(n)) return t(`products.category_${n}`);
  return findCategory(categories, n)?.name ?? n;
}

/** Clothing hides bag-only fields (SKU W×H×D) and gets a size chart instead. */
export function isClothingCategory(code: string | undefined | null): boolean {
  return normalizeCategory(code) === CLOTHING_CATEGORY;
}

/**
 * Size masters a category may sell, in the category's own order. No list
 * (bags) keeps every master in its catalog order.
 */
export function filterSizesForCategory<T extends { code: string }>(
  sizes: T[],
  allowed?: string[]
): T[] {
  if (!allowed || allowed.length === 0) return sizes;
  const byCode = new Map(sizes.map((s) => [s.code.toUpperCase(), s]));
  return allowed.flatMap((code) => {
    const row = byCode.get(code.toUpperCase());
    return row ? [row] : [];
  });
}

/** Default size for a new SKU: M for apparel, OS for bags, else the first. */
export function defaultSizeCode(
  sizes: { code: string }[],
  allowed?: string[]
): string {
  const has = (code: string) => sizes.some((s) => s.code === code);
  if (allowed && allowed.length > 0) {
    if (allowed.includes("M") && has("M")) return "M";
  } else if (has("OS")) {
    return "OS";
  }
  return sizes[0]?.code ?? "";
}

/** Orders size codes by the category's list; unknown sizes go last, in input order. */
export function sortSizes(codes: string[], order?: string[]): string[] {
  const rank = (code: string) => {
    const i = order?.indexOf(code.toUpperCase()) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return codes
    .map((code, i) => ({ code, i }))
    .sort((a, b) => rank(a.code) - rank(b.code) || a.i - b.i)
    .map((x) => x.code);
}

// ── Size chart ────────────────────────────────────────────────────────────────

/** One size's garment measurements in cm (`sizeChart` on the parent product). */
export interface SizeChartRow {
  size: string;
  chestCm?: number;
  lengthCm?: number;
  shoulderCm?: number;
  sleeveCm?: number;
}

export const SIZE_CHART_MEASUREMENTS = [
  "chestCm",
  "lengthCm",
  "shoulderCm",
  "sleeveCm",
] as const;

export type SizeChartMeasurement = (typeof SIZE_CHART_MEASUREMENTS)[number];

export const MAX_SIZE_CHART_ROWS = 20;
export const MAX_SIZE_CHART_CM = 300;

/** Editor row: inputs stay strings until save. */
export type SizeChartEditorRow = { size: string } & Record<
  SizeChartMeasurement,
  string
>;

export function mapSizeChart(raw: unknown): SizeChartRow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows = raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    if (typeof r.size !== "string" || !r.size) return [];
    const out: SizeChartRow = { size: r.size };
    for (const m of SIZE_CHART_MEASUREMENTS) {
      const v = r[m];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) out[m] = v;
    }
    return [out];
  });
  return rows.length > 0 ? rows : undefined;
}

function emptyEditorRow(size: string): SizeChartEditorRow {
  return { size, chestCm: "", lengthCm: "", shoulderCm: "", sleeveCm: "" };
}

/**
 * Editor rows: the saved chart, plus a blank row for every variant size it
 * lacks, all in the category's size order.
 */
export function sizeChartEditorRows(
  chart: SizeChartRow[] | undefined,
  variantSizes: string[],
  order?: string[]
): SizeChartEditorRow[] {
  const rows = new Map<string, SizeChartEditorRow>();
  for (const r of chart ?? []) {
    const size = r.size.toUpperCase();
    const row = emptyEditorRow(size);
    for (const m of SIZE_CHART_MEASUREMENTS) {
      if (r[m] != null) row[m] = String(r[m]);
    }
    rows.set(size, row);
  }
  for (const s of variantSizes) {
    const size = s.trim().toUpperCase();
    if (size && !rows.has(size)) rows.set(size, emptyEditorRow(size));
  }
  return sortSizes([...rows.keys()], order).map((size) => rows.get(size)!);
}

export type SizeChartError =
  | { code: "SIZE_REQUIRED" }
  | { code: "DUPLICATE_SIZE"; size: string }
  | { code: "INVALID_MEASUREMENT"; size: string }
  | { code: "NO_MEASUREMENT"; size: string }
  | { code: "TOO_MANY_ROWS" };

/**
 * Editor rows → `sizeChart` body. Rows with no measurements at all are
 * dropped (a prefilled size nobody measured), so an untouched grid saves
 * as `[]`. Values round to 0.5 cm like the backend.
 */
export function sizeChartFromEditorRows(
  rows: SizeChartEditorRow[]
): { chart: SizeChartRow[]; error?: undefined } | { chart?: undefined; error: SizeChartError } {
  const out: SizeChartRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const size = row.size.trim().toUpperCase();
    const filled = SIZE_CHART_MEASUREMENTS.filter((m) => row[m].trim() !== "");
    if (!size) {
      if (filled.length === 0) continue;
      return { error: { code: "SIZE_REQUIRED" } };
    }
    if (seen.has(size)) return { error: { code: "DUPLICATE_SIZE", size } };
    seen.add(size);
    if (filled.length === 0) continue;
    const entry: SizeChartRow = { size };
    for (const m of filled) {
      const v = Number(row[m].trim());
      if (!Number.isFinite(v) || v < 0 || v > MAX_SIZE_CHART_CM) {
        return { error: { code: "INVALID_MEASUREMENT", size } };
      }
      const rounded = Math.round(v * 2) / 2;
      if (rounded > 0) entry[m] = rounded;
    }
    if (SIZE_CHART_MEASUREMENTS.every((m) => entry[m] == null)) {
      return { error: { code: "NO_MEASUREMENT", size } };
    }
    out.push(entry);
  }
  if (out.length > MAX_SIZE_CHART_ROWS) return { error: { code: "TOO_MANY_ROWS" } };
  return { chart: out };
}

// ── Attribute presets ─────────────────────────────────────────────────────────

/** Quick-add attribute keys for a padded jacket's spec (display-only memo). */
export const CLOTHING_ATTRIBUTE_PRESETS = [
  "fill",
  "fill_weight",
  "outer_fabric",
  "lining",
  "care",
] as const;

export function attributePresetsFor(category: string | undefined | null): readonly string[] {
  return isClothingCategory(category) ? CLOTHING_ATTRIBUTE_PRESETS : [];
}
