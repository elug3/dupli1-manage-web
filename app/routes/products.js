import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { formatProductColors, listAllProducts, productListPrice, productPreviewImage, productVariantCount, } from "~/lib/api";
export function meta() {
    return [{ title: "Products | Dupli1 Admin" }];
}
export default function Products() {
    const navigate = useNavigate();
    const [allProducts, setAllProducts] = useState([]);
    const [activeCategory, setActiveCategory] = useState("all");
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [error, setError] = useState(null);
    useEffect(() => {
        setLoading(true);
        setError(null);
        listAllProducts()
            .then(setAllProducts)
            .catch((err) => {
            setAllProducts([]);
            setError(err instanceof Error ? err.message : "Failed to load products");
        })
            .finally(() => setLoading(false));
    }, []);
    const categories = useMemo(() => {
        const cats = new Set(allProducts.map((p) => p.category.toLowerCase()));
        return ["all", ...Array.from(cats).sort()];
    }, [allProducts]);
    const products = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return allProducts.filter((p) => {
            if (activeCategory !== "all" && p.category.toLowerCase() !== activeCategory) {
                return false;
            }
            if (!needle)
                return true;
            return (p.name.toLowerCase().includes(needle) ||
                p.id.toLowerCase().includes(needle) ||
                (p.brand?.toLowerCase().includes(needle) ?? false) ||
                formatProductColors(p).toLowerCase().includes(needle));
        });
    }, [allProducts, activeCategory, search]);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-[#1C1B1F] sm:text-2xl", children: "Products" }), _jsxs("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: ["Parent styles via", " ", _jsx("code", { className: "text-xs", children: "GET /product/api/v1/products" })] })] }), _jsxs(Link, { to: "/products/new", className: "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5A38E8] active:scale-[0.98] sm:w-auto", children: [_jsx(PlusIcon, {}), "New product"] })] }), _jsx("div", { className: "flex flex-wrap gap-2", children: categories.map((cat) => (_jsx("button", { onClick: () => setActiveCategory(cat), className: [
                        "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition",
                        activeCategory === cat
                            ? "bg-[#6D4AFF] text-white"
                            : "bg-white text-[#6B6480] border border-[#E5E3EE] hover:border-[#6D4AFF]/40",
                    ].join(" "), children: cat }, cat))) }), _jsx("input", { type: "search", placeholder: "Filter by name, ID, brand, or color\u2026", value: search, onChange: (e) => setSearch(e.target.value), className: "w-full max-w-md rounded-xl border border-[#E5E3EE] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20" }), error && (_jsx("div", { className: "rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600", children: error })), _jsx("div", { className: "overflow-hidden rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: loading ? (_jsx("div", { className: "flex items-center justify-center py-20", children: _jsx("div", { className: "h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }) })) : products.length === 0 ? (_jsx("div", { className: "px-5 py-16 text-center text-[#9D98B3]", children: "No products found" })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "divide-y divide-[#F0EEF8] md:hidden", children: products.map((product) => (_jsx(ProductCard, { product: product }, product.id))) }), _jsx("div", { className: "hidden overflow-x-auto md:block", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#F0EEF8] bg-[#FAFAFA] text-left", children: [
                                                "Name",
                                                "ID",
                                                "Brand",
                                                "Colors",
                                                "Variants",
                                                "Price",
                                                "Status",
                                            ].map((h) => (_jsx("th", { className: "px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: h }, h))) }) }), _jsx("tbody", { children: products.map((product) => (_jsxs("tr", { role: "link", tabIndex: 0, onClick: () => navigate(`/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`), onKeyDown: (e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    navigate(`/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`);
                                                }
                                            }, className: "cursor-pointer border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]", children: [_jsx("td", { className: "px-5 py-3.5 font-medium text-[#1C1B1F]", children: product.name }), _jsx("td", { className: "px-5 py-3.5 font-mono text-xs text-[#6B6480]", children: product.id }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: product.brand ?? "—" }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: formatProductColors(product) }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: productVariantCount(product) }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: productListPrice(product) ?? "—" }), _jsx("td", { className: "px-5 py-3.5 capitalize text-[#6B6480]", children: product.status ?? "—" })] }, product.id))) })] }) })] })) })] }));
}
function ProductCard({ product }) {
    const price = productListPrice(product);
    const imageUrl = productPreviewImage(product);
    return (_jsxs(Link, { to: `/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`, className: "flex gap-3 p-4 transition hover:bg-[#FAFAFA] active:bg-[#F4F3F8]", children: [_jsx(ProductPreviewThumb, { imageUrl: imageUrl, name: product.name }), _jsxs("div", { className: "min-w-0 flex-1 space-y-3", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium text-[#1C1B1F]", children: product.name }), _jsx("p", { className: "mt-1 font-mono text-xs text-[#6B6480]", children: product.id })] }), _jsxs("div", { className: "flex flex-wrap gap-2 text-xs text-[#6B6480]", children: [_jsx("span", { className: "rounded-full bg-[#F4F3F8] px-2.5 py-1", children: product.brand ?? "No brand" }), _jsx("span", { className: "rounded-full bg-[#F4F3F8] px-2.5 py-1", children: formatProductColors(product) }), _jsxs("span", { className: "rounded-full bg-[#F4F3F8] px-2.5 py-1", children: [productVariantCount(product), " variant", productVariantCount(product) === 1 ? "" : "s"] }), price && (_jsx("span", { className: "rounded-full bg-[#F4F3F8] px-2.5 py-1", children: price })), product.status && (_jsx("span", { className: "rounded-full bg-[#F4F3F8] px-2.5 py-1 capitalize", children: product.status }))] })] })] }));
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
