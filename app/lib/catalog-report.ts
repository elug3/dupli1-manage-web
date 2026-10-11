// Pure helpers for the catalog overview (`/catalog/overview`). The fetch is
// getCatalogReport in api.ts.

import type {
  CatalogCell,
  CatalogCountBy,
  CatalogReport,
  CatalogTally,
} from "~/lib/api";

export const CATALOG_COUNT_BY: readonly CatalogCountBy[] = ["products", "skus", "units"];

export function parseCountBy(raw: string | null | undefined): CatalogCountBy {
  return CATALOG_COUNT_BY.includes(raw as CatalogCountBy) ? (raw as CatalogCountBy) : "products";
}

export function countOf(tally: CatalogTally, by: CatalogCountBy): number {
  return tally[by];
}

/**
 * The `/products` list a count stands for. A brand without a master is
 * matched by name, which is a substring filter; every other brand by code.
 */
export function productsHref(filter: {
  brandCode?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  status?: string;
}): string {
  const q = new URLSearchParams();
  if (filter.category) q.set("category", filter.category);
  if (filter.subcategory) q.set("subcategory", filter.subcategory);
  if (filter.brandCode) q.set("brand_code", filter.brandCode);
  else if (filter.brand) q.set("brand", filter.brand);
  if (filter.status) q.set("status", filter.status);
  const qs = q.toString();
  return qs ? `/products?${qs}` : "/products";
}

/** One column of the brand × subcategory grid. */
export interface MatrixColumn {
  category: string;
  categoryName: string;
  subCategory: string;
  name: string;
}

export interface MatrixRow {
  brandCode: string;
  brand: string;
  /** Keyed by `category/subCategory`. */
  cells: Record<string, CatalogTally>;
  total: CatalogTally;
}

export function matrixKey(category: string, subCategory: string): string {
  return `${category}/${subCategory}`;
}

/**
 * The brand × subcategory grid: a column for every subcategory in taxonomy
 * order, and a row for every brand with something to count under `by`.
 */
export function buildMatrix(
  report: CatalogReport,
  by: CatalogCountBy
): { columns: MatrixColumn[]; rows: MatrixRow[]; totals: Record<string, CatalogTally> } {
  const columns: MatrixColumn[] = report.categories.flatMap((c) =>
    c.sub_categories.map((s) => ({
      category: c.code,
      categoryName: c.name,
      subCategory: s.code,
      name: s.name,
    }))
  );
  const totals: Record<string, CatalogTally> = {};
  for (const c of report.categories) {
    for (const s of c.sub_categories) totals[matrixKey(c.code, s.code)] = s;
  }

  const byBrand = new Map<string, CatalogCell[]>();
  for (const cell of report.cells) {
    const key = brandKey(cell.brand_code, cell.brand);
    const list = byBrand.get(key) ?? [];
    list.push(cell);
    byBrand.set(key, list);
  }
  const rows: MatrixRow[] = report.brands
    .filter((b) => countOf(b, by) > 0)
    .map((b) => {
      const cells: Record<string, CatalogTally> = {};
      for (const cell of byBrand.get(brandKey(b.code, b.name)) ?? []) {
        cells[matrixKey(cell.category, cell.sub_category)] = cell;
      }
      return { brandCode: b.code, brand: b.name, cells, total: b };
    });
  return { columns, rows, totals };
}

function brandKey(code: string, name: string): string {
  return code ? `code:${code}` : `name:${name.trim().toLowerCase()}`;
}

/** Heat-map fill for a grid cell, 0 (none) to 1 (the busiest cell). */
export function heat(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(1, 0.12 + (value / max) * 0.88);
}

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The by-brand table as CSV. */
export function brandsCsv(report: CatalogReport): string {
  const header = ["brand_code", "brand", "products", "skus", "units", "reserved"];
  const lines = report.brands.map((b) =>
    [b.code, b.name, b.products, b.skus, b.units, b.reserved].map(csvField).join(",")
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}
