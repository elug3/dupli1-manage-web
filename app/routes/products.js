import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { formatProductColors, listBrands, productPreviewImage, productVariantCount, searchProducts, } from "~/lib/api";
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
];
const STATUS_OPTIONS = ["", "active", "draft", "archived"];
const KNOWN_CATEGORIES = ["bags"];
const filterSelectCls = "rounded-xl border border-[#E5E3EE] bg-white px-3 py-2.5 text-sm text-[#1C1B1F] outline-none transition focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";
function productStatusLabel(status, t) {
    if (!status)
        return t("common.emptyValue");
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
function paramValue(params, key) {
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
    const [products, setProducts] = useState([]);
    const [total, setTotal] = useState(0);
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        setSearchInput(qParam);
    }, [qParam]);
    useEffect(() => {
        let cancelled = false;
        listBrands()
            .then((rows) => {
            if (!cancelled)
                setBrands(rows);
        })
            .catch(() => {
            if (!cancelled)
                setBrands([]);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    // Debounce search box → URL `q` (resets pagination).
    useEffect(() => {
        const trimmed = searchInput.trim();
        if (trimmed === qParam)
            return;
        const timer = window.setTimeout(() => {
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                if (trimmed)
                    next.set("q", trimmed);
                else
                    next.delete("q");
                next.delete("offset");
                return next;
            }, { replace: true });
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
            if (cancelled)
                return;
            setProducts(result.products);
            setTotal(result.total);
        })
            .catch((err) => {
            if (cancelled)
                return;
            setProducts([]);
            setTotal(0);
            setError(err instanceof Error ? err.message : t("products.failedToLoad"));
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [qParam, category, brand, status, sort, order, offset, t]);
    const categories = useMemo(() => {
        const cats = new Set(KNOWN_CATEGORIES);
        for (const p of products) {
            if (p.category)
                cats.add(p.category.toLowerCase());
        }
        if (category)
            cats.add(category.toLowerCase());
        return ["all", ...Array.from(cats).sort()];
    }, [products, category]);
    const activeCategory = category || "all";
    const hasActiveFilters = Boolean(qParam || category || brand || status);
    const pageStart = total === 0 ? 0 : offset + 1;
    const pageEnd = Math.min(offset + products.length, total);
    const canPrev = offset > 0;
    const canNext = offset + PAGE_SIZE < total;
    function updateFilters(patch) {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            for (const [key, value] of Object.entries(patch)) {
                if (value == null || value === "")
                    next.delete(key);
                else
                    next.set(key, value);
            }
            next.delete("offset");
            return next;
        });
    }
    function clearFilters() {
        setSearchInput("");
        setSearchParams({});
    }
    function goPage(nextOffset) {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (nextOffset <= 0)
                next.delete("offset");
            else
                next.set("offset", String(nextOffset));
            return next;
        });
    }
    function formatListPrice(product) {
        if (product.price == null)
            return null;
        return formatCurrency(product.price);
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-[#1C1B1F] sm:text-2xl", children: t("products.title") }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: t("products.subtitle") })] }), _jsxs(Link, { to: "/products/new", className: "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5A38E8] active:scale-[0.98] sm:w-auto", children: [_jsx(PlusIcon, {}), t("products.newProduct")] })] }), _jsx("div", { className: "flex flex-wrap gap-2", children: categories.map((cat) => (_jsx("button", { type: "button", onClick: () => updateFilters({ category: cat === "all" ? null : cat }), className: [
                        "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition",
                        activeCategory === cat
                            ? "bg-[#6D4AFF] text-white"
                            : "bg-white text-[#6B6480] border border-[#E5E3EE] hover:border-[#6D4AFF]/40",
                    ].join(" "), children: cat === "all" ? t("products.categoryAll") : cat }, cat))) }), _jsxs("div", { className: "flex flex-col gap-3 rounded-2xl border border-[#E5E3EE] bg-white p-4 shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsxs("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4", children: [_jsxs("label", { className: "space-y-1.5 sm:col-span-2 lg:col-span-2", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("products.filterSearch") }), _jsx("input", { type: "search", placeholder: t("products.filterPlaceholder"), value: searchInput, onChange: (e) => setSearchInput(e.target.value), className: "w-full rounded-xl border border-[#E5E3EE] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20" })] }), _jsxs("label", { className: "space-y-1.5", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("products.filterStatus") }), _jsx("select", { value: status, onChange: (e) => updateFilters({ status: e.target.value || null }), className: `w-full ${filterSelectCls}`, children: STATUS_OPTIONS.map((value) => (_jsx("option", { value: value, children: value === ""
                                                ? t("products.statusAll")
                                                : productStatusLabel(value, t) }, value || "all"))) })] }), _jsxs("label", { className: "space-y-1.5", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("products.filterBrand") }), _jsxs("select", { value: brand, onChange: (e) => updateFilters({ brand: e.target.value || null }), className: `w-full ${filterSelectCls}`, children: [_jsx("option", { value: "", children: t("products.brandAll") }), brands.map((b) => (_jsx("option", { value: b.name, children: b.name }, b.code)))] })] }), _jsxs("label", { className: "space-y-1.5 sm:col-span-2 lg:col-span-2", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("products.filterSort") }), _jsx("select", { value: sort, onChange: (e) => {
                                            const nextSort = e.target.value;
                                            const opt = SORT_OPTIONS.find((o) => o.value === nextSort);
                                            updateFilters({
                                                sort: nextSort === "newest" ? null : nextSort,
                                                order: opt && opt.order !== "desc" ? opt.order : null,
                                            });
                                        }, className: `w-full ${filterSelectCls}`, children: SORT_OPTIONS.map((opt) => (_jsx("option", { value: opt.value, children: t(opt.value === "newest"
                                                ? "products.sortNewest"
                                                : opt.value === "name"
                                                    ? "products.sortName"
                                                    : opt.value === "price"
                                                        ? "products.sortPrice"
                                                        : opt.value === "views"
                                                            ? "products.sortViews"
                                                            : "products.sortSold") }, opt.value))) })] })] }), _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsx("p", { className: "text-sm text-[#6B6480]", children: loading
                                    ? t("common.loadingEllipsis")
                                    : t("products.resultCount", {
                                        start: String(pageStart),
                                        end: String(pageEnd),
                                        total: String(total),
                                    }) }), hasActiveFilters && (_jsx("button", { type: "button", onClick: clearFilters, className: "text-sm font-semibold text-[#6D4AFF] hover:underline", children: t("products.clearFilters") }))] })] }), error && (_jsx("div", { className: "rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600", children: error })), _jsx("div", { className: "overflow-hidden rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: loading ? (_jsx("div", { className: "flex items-center justify-center py-20", children: _jsx("div", { className: "h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }) })) : products.length === 0 ? (_jsx("div", { className: "px-5 py-16 text-center text-[#9D98B3]", children: t("products.noProductsFound") })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "divide-y divide-[#F0EEF8] md:hidden", children: products.map((product) => (_jsx(ProductCard, { product: product }, product.id))) }), _jsx("div", { className: "hidden overflow-x-auto md:block", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#F0EEF8] bg-[#FAFAFA] text-left", children: [
                                                ["name", t("products.colName")],
                                                ["id", t("products.colId")],
                                                ["brand", t("products.colBrand")],
                                                ["colors", t("products.colColors")],
                                                ["variants", t("products.colVariants")],
                                                ["price", t("products.colPrice")],
                                                ["status", t("products.colStatus")],
                                            ].map(([key, label]) => (_jsx("th", { className: "px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: label }, key))) }) }), _jsx("tbody", { children: products.map((product) => (_jsxs("tr", { role: "link", tabIndex: 0, onClick: () => navigate(`/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`), onKeyDown: (e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    navigate(`/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`);
                                                }
                                            }, className: "cursor-pointer border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]", children: [_jsx("td", { className: "px-5 py-3.5 font-medium text-[#1C1B1F]", children: product.name }), _jsx("td", { className: "px-5 py-3.5 font-mono text-xs text-[#6B6480]", children: product.id }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: product.brand ?? t("common.emptyValue") }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: formatProductColors(product) }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: productVariantCount(product) }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: formatListPrice(product) ?? t("common.emptyValue") }), _jsx("td", { className: "px-5 py-3.5 capitalize text-[#6B6480]", children: productStatusLabel(product.status, t) })] }, product.id))) })] }) })] })) }), !loading && total > PAGE_SIZE && (_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsx("button", { type: "button", disabled: !canPrev, onClick: () => goPage(Math.max(0, offset - PAGE_SIZE)), className: "rounded-xl border border-[#E5E3EE] px-4 py-2 text-sm font-semibold text-[#6D4AFF] transition hover:border-[#6D4AFF]/40 disabled:cursor-not-allowed disabled:opacity-40", children: t("products.prevPage") }), _jsx("p", { className: "text-sm text-[#6B6480]", children: t("products.pageLabel", {
                            page: String(Math.floor(offset / PAGE_SIZE) + 1),
                            pages: String(Math.max(1, Math.ceil(total / PAGE_SIZE))),
                        }) }), _jsx("button", { type: "button", disabled: !canNext, onClick: () => goPage(offset + PAGE_SIZE), className: "rounded-xl border border-[#E5E3EE] px-4 py-2 text-sm font-semibold text-[#6D4AFF] transition hover:border-[#6D4AFF]/40 disabled:cursor-not-allowed disabled:opacity-40", children: t("products.nextPage") })] }))] }));
}
function ProductCard({ product }) {
    const { t, formatCurrency } = useI18n();
    const price = product.price == null ? null : formatCurrency(product.price);
    const imageUrl = productPreviewImage(product);
    const variantCount = productVariantCount(product);
    return (_jsxs(Link, { to: `/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`, className: "flex gap-3 p-4 transition hover:bg-[#FAFAFA] active:bg-[#F4F3F8]", children: [_jsx(ProductPreviewThumb, { imageUrl: imageUrl, name: product.name }), _jsxs("div", { className: "min-w-0 flex-1 space-y-3", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium text-[#1C1B1F]", children: product.name }), _jsx("p", { className: "mt-1 font-mono text-xs text-[#6B6480]", children: product.id })] }), _jsxs("div", { className: "flex flex-wrap gap-2 text-xs text-[#6B6480]", children: [_jsx("span", { className: "rounded-full bg-[#F4F3F8] px-2.5 py-1", children: product.brand ?? t("products.noBrand") }), _jsx("span", { className: "rounded-full bg-[#F4F3F8] px-2.5 py-1", children: formatProductColors(product) }), _jsx("span", { className: "rounded-full bg-[#F4F3F8] px-2.5 py-1", children: t("products.variantCount", { count: variantCount }) }), price && (_jsx("span", { className: "rounded-full bg-[#F4F3F8] px-2.5 py-1", children: price })), product.status && (_jsx("span", { className: "rounded-full bg-[#F4F3F8] px-2.5 py-1 capitalize", children: productStatusLabel(product.status, t) }))] })] })] }));
}
function ProductPreviewThumb({ imageUrl, name, }) {
    return (_jsxs("div", { className: "size-16 shrink-0 overflow-hidden rounded-xl border border-[#E5E3EE] bg-[#FAFAFA]", children: [imageUrl ? (_jsx("img", { src: imageUrl, alt: "", className: "size-full object-cover", loading: "lazy" })) : (_jsx("div", { className: "flex size-full items-center justify-center text-[#9D98B3]", "aria-hidden": "true", children: _jsx(ProductPlaceholderIcon, {}) })), _jsx("span", { className: "sr-only", children: name })] }));
}
function ProductPlaceholderIcon() {
    return (_jsxs("svg", { className: "size-6", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [_jsx("path", { d: "M12 2l9 4.5V17L12 21.5 3 17V6.5L12 2z", stroke: "currentColor", strokeWidth: "1.8", strokeLinejoin: "round" }), _jsx("path", { d: "M12 2v19.5M3 6.5l9 4.5 9-4.5", stroke: "currentColor", strokeWidth: "1.8", strokeLinejoin: "round" })] }));
}
function PlusIcon() {
    return (_jsx("svg", { className: "size-4", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: _jsx("path", { d: "M12 5v14M5 12h14", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }) }));
}
