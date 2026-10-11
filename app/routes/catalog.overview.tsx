import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  type CatalogCategoryCount,
  type CatalogCountBy,
  type CatalogReport,
  type CatalogTally,
  getCatalogReport,
} from "~/lib/api";
import {
  CATALOG_COUNT_BY,
  brandsCsv,
  buildMatrix,
  countOf,
  heat,
  matrixKey,
  parseCountBy,
  productsHref,
} from "~/lib/catalog-report";
import { useI18n } from "~/lib/i18n";

export function meta() {
  return [{ title: "Catalog overview | Dupli1 Admin" }];
}

const STATUS_OPTIONS = ["", "active", "draft", "archived"] as const;

const cardCls =
  "rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]";

type T = (key: string, vars?: Record<string, string | number>) => string;

function categoryName(c: { code: string; name: string }, t: T): string {
  return c.code === "bags" || c.code === "clothing" ? t(`products.category_${c.code}`) : c.name || c.code;
}

function subCategoryName(s: { code: string; name: string }, t: T): string {
  return s.code ? s.name || s.code : t("catalogOverview.noSubcategory");
}

export default function CatalogOverview() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const by = parseCountBy(searchParams.get("by"));
  const status = searchParams.get("status") ?? "";

  const [report, setReport] = useState<CatalogReport | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCatalogReport(status || undefined)
      .then((r) => {
        if (cancelled) return;
        setForbidden(r === null);
        setReport(r);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t("catalogOverview.failedToLoad"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, t]);

  function setParam(key: string, value: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );
  }

  const exportCsv = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([brandsCsv(report)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `catalog-brands${status ? `-${status}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs text-faint">
            <Link to="/catalog" className="hover:text-accent hover:underline">
              {t("nav.catalog")}
            </Link>
            <span className="mx-1.5">/</span>
            {t("catalogOverview.breadcrumb")}
          </p>
          <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">{t("catalogOverview.title")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("catalogOverview.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label={t("catalogOverview.countBy")}
            className="flex gap-0.5 rounded-xl border border-edge bg-surface p-1"
          >
            {CATALOG_COUNT_BY.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={by === value}
                onClick={() => setParam("by", value === "products" ? null : value)}
                className={[
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  by === value ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-page hover:text-ink",
                ].join(" ")}
              >
                {t(`catalogOverview.by_${value}`)}
              </button>
            ))}
          </div>
          <select
            aria-label={t("products.filterStatus")}
            value={status}
            onChange={(e) => setParam("status", e.target.value || null)}
            className="rounded-xl border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {STATUS_OPTIONS.map((value) => (
              <option key={value || "all"} value={value}>
                {value ? t(`common.status${value[0].toUpperCase()}${value.slice(1)}`) : t("products.statusAll")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg">{error}</div>}
      {forbidden && (
        <div className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-fg">{t("catalogOverview.forbidden")}</div>
      )}

      {loading && !report ? (
        <div className="flex items-center justify-center py-32">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : report ? (
        <div className={["space-y-6 transition-opacity", loading ? "opacity-60" : ""].join(" ")}>
          <Tiles report={report} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
            <BrandTable report={report} by={by} status={status} onExport={exportCsv} />
            <CategoryPanel report={report} by={by} status={status} />
          </div>
          <BrandMatrix report={report} by={by} status={status} />
        </div>
      ) : null}
    </div>
  );
}

function Tiles({ report }: { report: CatalogReport }) {
  const { t } = useI18n();
  const n = (v: number) => v.toLocaleString();
  const { totals } = report;
  const stocked = report.brands.filter((b) => b.products > 0).length;
  const empty = report.brands.filter((b) => b.products === 0).map((b) => b.name);
  const perProduct = totals.products > 0 ? (totals.skus / totals.products).toFixed(1) : "0";
  const tiles: [string, string, string][] = [
    [
      t("catalogOverview.tileProducts"),
      n(totals.products),
      t("catalogOverview.tileProductsSub", {
        active: n(report.products_by_status.active ?? 0),
        draft: n(report.products_by_status.draft ?? 0),
      }),
    ],
    [t("catalogOverview.tileSkus"), n(totals.skus), t("catalogOverview.tileSkusSub", { avg: perProduct })],
    [t("catalogOverview.tileUnits"), n(totals.units), t("catalogOverview.tileUnitsSub", { reserved: n(totals.reserved) })],
    [
      t("catalogOverview.tileBrands"),
      n(stocked),
      empty.length > 0
        ? t("catalogOverview.tileBrandsEmpty", { count: empty.length, names: empty.join(", ") })
        : t("catalogOverview.tileBrandsAll"),
    ],
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map(([label, value, sub]) => (
        <div key={label} className={cardCls}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</div>
          <div className="mt-1 text-2xl font-bold text-ink">{value}</div>
          <div className="mt-1 truncate text-xs text-muted" title={sub}>
            {sub}
          </div>
        </div>
      ))}
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-edge-soft">
      {value > 0 && <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(2, pct)}%` }} />}
    </div>
  );
}

function BrandTable({
  report,
  by,
  status,
  onExport,
}: {
  report: CatalogReport;
  by: CatalogCountBy;
  status: string;
  onExport: () => void;
}) {
  const { t } = useI18n();
  const rows = useMemo(
    () =>
      [...report.brands].sort(
        (a, b) => countOf(b, by) - countOf(a, by) || a.name.localeCompare(b.name)
      ),
    [report.brands, by]
  );
  const max = Math.max(0, ...rows.map((r) => countOf(r, by)));
  const total = countOf(report.totals, by);
  const stocked = report.brands.filter((b) => b.products > 0).length;
  const num = "px-3 py-2.5 text-right tabular-nums";

  return (
    <section className={cardCls}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">{t("catalogOverview.byBrand")}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {t("catalogOverview.byBrandNote", { by: t(`catalogOverview.by_${by}`) })}
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          className="shrink-0 rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-page"
        >
          {t("catalogOverview.exportCsv")}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="whitespace-nowrap bg-panel text-[11px] font-semibold uppercase tracking-wide text-faint">
              <th className="rounded-l-lg px-3 py-2 text-left">{t("catalogOverview.colBrand")}</th>
              <th className="px-3 py-2 text-left">{t("catalogOverview.colShare")}</th>
              <th className="px-3 py-2 text-right">{t("catalogOverview.by_products")}</th>
              <th className="px-3 py-2 text-right">{t("catalogOverview.by_skus")}</th>
              <th className="rounded-r-lg px-3 py-2 text-right">{t("catalogOverview.by_units")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  {t("catalogOverview.noBrands")}
                </td>
              </tr>
            )}
            {rows.map((b) => {
              const empty = b.products === 0;
              const value = countOf(b, by);
              return (
                <tr key={b.code || `name:${b.name}`} className="border-b border-edge-soft last:border-0">
                  <td className="px-3 py-2.5">
                    {empty ? (
                      <span className="flex items-center gap-2 font-semibold text-faint">
                        <span className="h-2 w-2 rounded-full bg-edge" />
                        {b.name || t("catalogOverview.noBrand")}
                      </span>
                    ) : (
                      <Link
                        to={productsHref({ brandCode: b.code, brand: b.name, status })}
                        className="flex items-center gap-2 whitespace-nowrap font-semibold text-ink hover:text-accent"
                      >
                        <span className="h-2 w-2 rounded-full bg-accent" />
                        {b.name || t("catalogOverview.noBrand")}
                        {!b.code && (
                          <span className="whitespace-nowrap rounded bg-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-warn-fg">
                            {t("catalogOverview.noMaster")}
                          </span>
                        )}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-36">
                        <Bar value={value} max={max} />
                      </div>
                      <span className="w-9 text-xs text-muted tabular-nums">
                        {total > 0 && value > 0 ? `${Math.round((value / total) * 100)}%` : "—"}
                      </span>
                    </div>
                  </td>
                  <td className={`${num} ${by === "products" ? "font-bold text-ink" : "text-muted"} ${empty ? "text-faint" : ""}`}>
                    {b.products.toLocaleString()}
                  </td>
                  <td className={`${num} ${by === "skus" ? "font-bold text-ink" : "text-muted"} ${empty ? "text-faint" : ""}`}>
                    {b.skus.toLocaleString()}
                  </td>
                  <td className={`${num} ${by === "units" ? "font-bold text-ink" : "text-muted"} ${empty ? "text-faint" : ""}`}>
                    {b.units.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-bold text-ink">
              <td className="px-3 pt-3">{t("catalogOverview.total")}</td>
              <td className="px-3 pt-3 text-xs font-normal text-muted">
                {t("catalogOverview.brandsStocked", { stocked, total: report.brands.length })}
              </td>
              <td className="px-3 pt-3 text-right tabular-nums">{report.totals.products.toLocaleString()}</td>
              <td className="px-3 pt-3 text-right tabular-nums">{report.totals.skus.toLocaleString()}</td>
              <td className="px-3 pt-3 text-right tabular-nums">{report.totals.units.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function CategoryPanel({ report, by, status }: { report: CatalogReport; by: CatalogCountBy; status: string }) {
  const { t } = useI18n();
  const total = countOf(report.totals, by);
  const unsorted = report.categories.reduce(
    (n, c) => n + (c.sub_categories.find((s) => s.code === "")?.products ?? 0),
    0
  );
  return (
    <section className={`${cardCls} space-y-4 self-start`}>
      <h2 className="font-semibold text-ink">{t("catalogOverview.byCategory")}</h2>
      {report.categories.map((c) => (
        <CategoryBlock key={c.code} category={c} by={by} status={status} total={total} />
      ))}
      {unsorted > 0 && (
        <div className="rounded-xl bg-warn-bg px-3 py-2.5 text-xs font-semibold text-warn-fg">
          {t("catalogOverview.withoutSubcategory", { count: unsorted })}
        </div>
      )}
    </section>
  );
}

function CategoryBlock({
  category,
  by,
  status,
  total,
}: {
  category: CatalogCategoryCount;
  by: CatalogCountBy;
  status: string;
  total: number;
}) {
  const { t } = useI18n();
  const value = countOf(category, by);
  const max = Math.max(0, ...category.sub_categories.map((s) => countOf(s, by)));
  const secondary: CatalogCountBy = by === "skus" ? "products" : "skus";
  return (
    <div className="space-y-2.5 rounded-xl bg-panel p-3.5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Link
            to={productsHref({ category: category.code, status })}
            className="font-bold text-ink hover:text-accent"
          >
            {categoryName(category, t)}
          </Link>
          <p className="text-xs text-muted">
            {countOf(category, secondary).toLocaleString()} {t(`catalogOverview.by_${secondary}`)}
            {total > 0 && ` · ${t("catalogOverview.shareOfCatalog", { pct: Math.round((value / total) * 100) })}`}
          </p>
        </div>
        <span className="text-2xl font-bold text-accent tabular-nums">{value.toLocaleString()}</span>
      </div>
      {category.sub_categories.map((s) => {
        const v = countOf(s, by);
        return (
          <Link
            key={s.code || "none"}
            to={productsHref({ category: category.code, subcategory: s.code, status })}
            className="grid grid-cols-[8.5rem_minmax(0,1fr)_2.5rem] items-center gap-2.5 rounded-md text-sm hover:text-accent"
          >
            <span className={["truncate", s.code ? "text-ink" : "italic text-muted"].join(" ")}>
              {subCategoryName(s, t)}
            </span>
            <span className="h-2 w-full rounded-full bg-edge-soft">
              {v > 0 && (
                <span
                  className="block h-2 rounded-full bg-accent"
                  style={{ width: `${max > 0 ? Math.max(2, (v / max) * 100) : 0}%` }}
                />
              )}
            </span>
            <span className={["text-right font-semibold tabular-nums", v ? "text-ink" : "text-faint"].join(" ")}>
              {v.toLocaleString()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function BrandMatrix({ report, by, status }: { report: CatalogReport; by: CatalogCountBy; status: string }) {
  const { t } = useI18n();
  const { columns, rows, totals } = useMemo(() => buildMatrix(report, by), [report, by]);
  const max = Math.max(
    0,
    ...rows.flatMap((r) => Object.values(r.cells).map((c: CatalogTally) => countOf(c, by)))
  );
  const groups = report.categories
    .filter((c) => c.sub_categories.length > 0)
    .map((c) => ({ code: c.code, label: categoryName(c, t), span: c.sub_categories.length }));

  return (
    <section className={cardCls}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">{t("catalogOverview.matrix")}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {t("catalogOverview.matrixNote", { by: t(`catalogOverview.by_${by}`) })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-faint" aria-hidden>
          0
          {[0.12, 0.34, 0.56, 0.78, 1].map((o) => (
            <span key={o} className="h-3 w-4 rounded-sm bg-accent" style={{ opacity: o }} />
          ))}
          {max.toLocaleString()}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t("catalogOverview.noBrands")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-1 text-sm">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                <th />
                {groups.map((g) => (
                  <th key={g.code} colSpan={g.span} className="border-b border-edge px-1 pb-1 text-center">
                    {g.label}
                  </th>
                ))}
                <th />
              </tr>
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="w-40" />
                {columns.map((c) => (
                  <th key={matrixKey(c.category, c.subCategory)} className="px-1 py-1 text-center font-semibold">
                    {subCategoryName({ code: c.subCategory, name: c.name }, t)}
                  </th>
                ))}
                <th className="px-1 py-1 text-center text-faint">{t("catalogOverview.total")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.brandCode || `name:${r.brand}`}>
                  <th className="truncate pr-2 text-left font-semibold text-ink">
                    {r.brand || t("catalogOverview.noBrand")}
                  </th>
                  {columns.map((c) => {
                    const key = matrixKey(c.category, c.subCategory);
                    const cell = r.cells[key];
                    const v = cell ? countOf(cell, by) : 0;
                    const h = heat(v, max);
                    if (v === 0) {
                      return (
                        <td key={key} className="py-2 text-center text-faint">
                          ·
                        </td>
                      );
                    }
                    return (
                      <td key={key} className="p-0">
                        <Link
                          to={productsHref({
                            brandCode: r.brandCode,
                            brand: r.brand,
                            category: c.category,
                            subcategory: c.subCategory,
                            status,
                          })}
                          title={`${r.brand} · ${subCategoryName({ code: c.subCategory, name: c.name }, t)}`}
                          className="relative block rounded-md py-2 text-center font-semibold tabular-nums ring-accent hover:ring-2"
                        >
                          <span className="absolute inset-0 rounded-md bg-accent" style={{ opacity: h }} />
                          <span className={["relative", h > 0.55 ? "text-white" : "text-ink"].join(" ")}>
                            {v.toLocaleString()}
                          </span>
                        </Link>
                      </td>
                    );
                  })}
                  <td className="rounded-md bg-panel py-2 text-center font-bold text-ink tabular-nums">
                    {countOf(r.total, by).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="pr-2 text-left font-semibold text-ink">{t("catalogOverview.total")}</th>
                {columns.map((c) => {
                  const key = matrixKey(c.category, c.subCategory);
                  return (
                    <td key={key} className="rounded-md bg-panel py-2 text-center font-bold text-ink tabular-nums">
                      {countOf(totals[key], by).toLocaleString()}
                    </td>
                  );
                })}
                <td className="rounded-md bg-panel py-2 text-center font-bold text-ink tabular-nums">
                  {countOf(report.totals, by).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
