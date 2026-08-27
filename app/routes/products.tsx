import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  type CatalogCodeName,
  type Product,
  formatProductColors,
  listBrands,
  productPreviewImage,
  productVariantCount,
  searchProducts,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";

export function meta() {
  return [{ title: "Products | Dupli1 Admin" }];
}

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

const SORT_OPTIONS = [
  { value: "newest", order: "desc" },
  { value: "name", order: "asc" },
  { value: "price", order: "asc" },
  { value: "views", order: "desc" },
  { value: "sold", order: "desc" },
] as const;

const STATUS_OPTIONS = ["", "active", "draft", "archived"] as const;

const KNOWN_CATEGORIES = ["bags"] as const;

const filterSelectCls =
  "rounded-xl border border-edge bg-surface px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

function productStatusLabel(
  status: string | undefined,
  t: (key: string) => string
): string {
  if (!status) return t("common.emptyValue");
  switch (status.toLowerCase()) {
    case "active":
      return t("common.statusActive");
    case "draft":
      return t("common.statusDraft");
    case "archived":
      return t("common.statusArchived");
    default:
      return status;
  }
}

function paramValue(params: URLSearchParams, key: string): string {
  return params.get(key)?.trim() ?? "";
}

export default function Products() {
  const navigate = useNavigate();
  const { t, formatCurrency } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const qParam = paramValue(searchParams, "q");
  const category = paramValue(searchParams, "category");
  const brand = paramValue(searchParams, "brand");
  const status = paramValue(searchParams, "status");
  const sort = paramValue(searchParams, "sort") || "newest";
  const order = paramValue(searchParams, "order");
  const offsetRaw = Number.parseInt(paramValue(searchParams, "offset") || "0", 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

  const [searchInput, setSearchInput] = useState(qParam);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [brands, setBrands] = useState<CatalogCodeName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(qParam);
  }, [qParam]);

  useEffect(() => {
    let cancelled = false;
    listBrands()
      .then((rows) => {
        if (!cancelled) setBrands(rows);
      })
      .catch(() => {
        if (!cancelled) setBrands([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce search box → URL `q` (resets pagination).
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === qParam) return;
    const timer = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (trimmed) next.set("q", trimmed);
          else next.delete("q");
          next.delete("offset");
          return next;
        },
        { replace: true }
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput, qParam, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const sortOption = SORT_OPTIONS.find((opt) => opt.value === sort);
    const effectiveSort = sortOption?.value ?? "newest";
    const effectiveOrder = order || sortOption?.order || "desc";

    searchProducts({
      q: qParam || undefined,
      category: category || undefined,
      brand: brand || undefined,
      status: status || undefined,
      sort: effectiveSort,
      order: effectiveOrder,
      limit: PAGE_SIZE,
      offset,
    })
      .then((result) => {
        if (cancelled) return;
        setProducts(result.products);
        setTotal(result.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setProducts([]);
        setTotal(0);
        setError(
          err instanceof Error ? err.message : t("products.failedToLoad")
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [qParam, category, brand, status, sort, order, offset, t]);

  const categories = useMemo(() => {
    const cats = new Set<string>(KNOWN_CATEGORIES);
    for (const p of products) {
      if (p.category) cats.add(p.category.toLowerCase());
    }
    if (category) cats.add(category.toLowerCase());
    return ["all", ...Array.from(cats).sort()];
  }, [products, category]);

  const activeCategory = category || "all";
  const hasActiveFilters = Boolean(qParam || category || brand || status);
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + products.length, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  function updateFilters(patch: Record<string, string | null>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      next.delete("offset");
      return next;
    });
  }

  function clearFilters() {
    setSearchInput("");
    setSearchParams({});
  }

  function goPage(nextOffset: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextOffset <= 0) next.delete("offset");
      else next.set("offset", String(nextOffset));
      return next;
    });
  }

  function formatListPrice(product: Product): string | null {
    if (product.price == null) return null;
    return formatCurrency(product.price);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">
            {t("products.title")}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {t("products.subtitle")}
          </p>
        </div>
        <Link
          to="/products/new"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover active:scale-[0.98] sm:w-auto"
        >
          <PlusIcon />
          {t("products.newProduct")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() =>
              updateFilters({ category: cat === "all" ? null : cat })
            }
            className={[
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition",
              activeCategory === cat
                ? "bg-accent text-white"
                : "bg-surface text-muted border border-edge hover:border-accent/40",
            ].join(" ")}
          >
            {cat === "all" ? t("products.categoryAll") : cat}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-edge bg-surface p-4 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1.5 sm:col-span-2 lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("products.filterSearch")}
            </span>
            <input
              type="search"
              placeholder={t("products.filterPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-xl border border-edge bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("products.filterStatus")}
            </span>
            <select
              value={status}
              onChange={(e) => updateFilters({ status: e.target.value || null })}
              className={`w-full ${filterSelectCls}`}
            >
              {STATUS_OPTIONS.map((value) => (
                <option key={value || "all"} value={value}>
                  {value === ""
                    ? t("products.statusAll")
                    : productStatusLabel(value, t)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("products.filterBrand")}
            </span>
            <select
              value={brand}
              onChange={(e) => updateFilters({ brand: e.target.value || null })}
              className={`w-full ${filterSelectCls}`}
            >
              <option value="">{t("products.brandAll")}</option>
              {brands.map((b) => (
                <option key={b.code} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 sm:col-span-2 lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("products.filterSort")}
            </span>
            <select
              value={sort}
              onChange={(e) => {
                const nextSort = e.target.value;
                const opt = SORT_OPTIONS.find((o) => o.value === nextSort);
                updateFilters({
                  sort: nextSort === "newest" ? null : nextSort,
                  order: opt && opt.order !== "desc" ? opt.order : null,
                });
              }}
              className={`w-full ${filterSelectCls}`}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(
                    opt.value === "newest"
                      ? "products.sortNewest"
                      : opt.value === "name"
                        ? "products.sortName"
                        : opt.value === "price"
                          ? "products.sortPrice"
                          : opt.value === "views"
                            ? "products.sortViews"
                            : "products.sortSold"
                  )}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">
            {loading
              ? t("common.loadingEllipsis")
              : t("products.resultCount", {
                  start: String(pageStart),
                  end: String(pageEnd),
                  total: String(total),
                })}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-semibold text-accent hover:underline"
            >
              {t("products.clearFilters")}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-edge bg-surface shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : products.length === 0 ? (
          <div className="px-5 py-16 text-center text-faint">
            {t("products.noProductsFound")}
          </div>
        ) : (
          <>
            <div className="divide-y divide-edge-soft md:hidden">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge-soft bg-subtle text-left">
                    {(
                      [
                        ["name", t("products.colName")],
                        ["id", t("products.colId")],
                        ["brand", t("products.colBrand")],
                        ["colors", t("products.colColors")],
                        ["variants", t("products.colVariants")],
                        ["price", t("products.colPrice")],
                        ["status", t("products.colStatus")],
                      ] as const
                    ).map(([key, label]) => (
                      <th
                        key={key}
                        className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr
                      key={product.id}
                      role="link"
                      tabIndex={0}
                      onClick={() =>
                        navigate(
                          `/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(
                            `/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`
                          );
                        }
                      }}
                      className="cursor-pointer border-b border-edge-soft last:border-0 hover:bg-subtle"
                    >
                      <td className="px-5 py-3.5 font-medium text-ink">
                        {product.name}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-muted">
                        {product.id}
                      </td>
                      <td className="px-5 py-3.5 text-muted">
                        {product.brand ?? t("common.emptyValue")}
                      </td>
                      <td className="px-5 py-3.5 text-muted">
                        {formatProductColors(product)}
                      </td>
                      <td className="px-5 py-3.5 text-muted">
                        {productVariantCount(product)}
                      </td>
                      <td className="px-5 py-3.5 text-muted">
                        {formatListPrice(product) ?? t("common.emptyValue")}
                      </td>
                      <td className="px-5 py-3.5 capitalize text-muted">
                        {productStatusLabel(product.status, t)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => goPage(Math.max(0, offset - PAGE_SIZE))}
            className="rounded-xl border border-edge px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("products.prevPage")}
          </button>
          <p className="text-sm text-muted">
            {t("products.pageLabel", {
              page: String(Math.floor(offset / PAGE_SIZE) + 1),
              pages: String(Math.max(1, Math.ceil(total / PAGE_SIZE))),
            })}
          </p>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => goPage(offset + PAGE_SIZE)}
            className="rounded-xl border border-edge px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("products.nextPage")}
          </button>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  const { t, formatCurrency } = useI18n();
  const price =
    product.price == null ? null : formatCurrency(product.price);
  const imageUrl = productPreviewImage(product);
  const variantCount = productVariantCount(product);

  return (
    <Link
      to={`/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`}
      className="flex gap-3 p-4 transition hover:bg-subtle active:bg-page"
    >
      <ProductPreviewThumb imageUrl={imageUrl} name={product.name} />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="font-medium text-ink">{product.name}</p>
          <p className="mt-1 font-mono text-xs text-muted">{product.id}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          <span className="rounded-full bg-page px-2.5 py-1">
            {product.brand ?? t("products.noBrand")}
          </span>
          <span className="rounded-full bg-page px-2.5 py-1">
            {formatProductColors(product)}
          </span>
          <span className="rounded-full bg-page px-2.5 py-1">
            {t("products.variantCount", { count: variantCount })}
          </span>
          {price && (
            <span className="rounded-full bg-page px-2.5 py-1">{price}</span>
          )}
          {product.status && (
            <span className="rounded-full bg-page px-2.5 py-1 capitalize">
              {productStatusLabel(product.status, t)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function ProductPreviewThumb({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  return (
    <div className="size-16 shrink-0 overflow-hidden rounded-xl border border-edge bg-subtle">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className="flex size-full items-center justify-center text-faint"
          aria-hidden="true"
        >
          <ProductPlaceholderIcon />
        </div>
      )}
      <span className="sr-only">{name}</span>
    </div>
  );
}

function ProductPlaceholderIcon() {
  return (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l9 4.5V17L12 21.5 3 17V6.5L12 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 2v19.5M3 6.5l9 4.5 9-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
