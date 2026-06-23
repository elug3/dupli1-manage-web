import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { PRODUCT_CATEGORIES, getCategories, searchProducts, } from "~/lib/api";
export function meta() {
    return [{ title: "Products | Schick Admin" }];
}
export default function Products() {
    const [categories, setCategories] = useState([...PRODUCT_CATEGORIES]);
    const [activeCategory, setActiveCategory] = useState("shoes");
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [error, setError] = useState(null);
    useEffect(() => {
        getCategories()
            .then((cats) => {
            if (cats.length > 0)
                setCategories(cats);
        })
            .catch(() => { });
    }, []);
    useEffect(() => {
        setLoading(true);
        setError(null);
        const filters = {};
        if (search.trim())
            filters.title = search.trim();
        searchProducts(activeCategory, filters)
            .then(setProducts)
            .catch((err) => {
            setProducts([]);
            setError(err instanceof Error ? err.message : "Failed to load products");
        })
            .finally(() => setLoading(false));
    }, [activeCategory, search]);
    return (_jsxs("div", { className: "space-y-6", children: [_jsx("div", { className: "flex items-center justify-between", children: _jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-[#1C1B1F]", children: "Products" }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: "Read-only catalog search via the product service" })] }) }), _jsx("div", { className: "flex flex-wrap gap-2", children: categories.map((cat) => (_jsx("button", { onClick: () => setActiveCategory(cat), className: [
                        "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition",
                        activeCategory === cat
                            ? "bg-[#6D4AFF] text-white"
                            : "bg-white text-[#6B6480] border border-[#E5E3EE] hover:border-[#6D4AFF]/40",
                    ].join(" "), children: cat }, cat))) }), _jsx("input", { type: "search", placeholder: "Filter by title\u2026", value: search, onChange: (e) => setSearch(e.target.value), className: "w-full max-w-md rounded-xl border border-[#E5E3EE] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20" }), error && (_jsx("div", { className: "rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600", children: error })), _jsx("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)] overflow-hidden", children: loading ? (_jsx("div", { className: "flex items-center justify-center py-20", children: _jsx("div", { className: "h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }) })) : products.length === 0 ? (_jsx("div", { className: "px-5 py-16 text-center text-[#9D98B3]", children: "No products found in this category" })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#F0EEF8] bg-[#FAFAFA] text-left", children: ["Name", "SKU", "Brand", "Category", ""].map((h) => (_jsx("th", { className: "px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: h }, h))) }) }), _jsx("tbody", { children: products.map((product) => (_jsxs("tr", { className: "border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]", children: [_jsx("td", { className: "px-5 py-3.5 font-medium text-[#1C1B1F]", children: product.name }), _jsx("td", { className: "px-5 py-3.5 font-mono text-xs text-[#6B6480]", children: product.sku ?? "—" }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: product.brand ?? "—" }), _jsx("td", { className: "px-5 py-3.5 capitalize text-[#6B6480]", children: product.category }), _jsx("td", { className: "px-5 py-3.5 text-right", children: _jsx(Link, { to: `/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`, className: "text-xs font-semibold text-[#6D4AFF] hover:underline", children: "Details \u2192" }) })] }, product.id))) })] }) })) })] }));
}
