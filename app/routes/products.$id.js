import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { getProduct } from "~/lib/api";
export function meta() {
    return [{ title: "Product | Schick Admin" }];
}
export default function ProductDetail() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const category = searchParams.get("category") ?? "shoes";
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!id)
            return;
        getProduct(category, id)
            .then((p) => {
            if (!p)
                throw new Error("Product not found");
            setProduct(p);
        })
            .catch((err) => setError(err instanceof Error ? err.message : "Product not found"))
            .finally(() => setLoading(false));
    }, [id, category]);
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center py-32", children: _jsx("div", { className: "h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }) }));
    }
    if (error || !product) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsx(Link, { to: "/products", className: "text-sm text-[#6D4AFF] hover:underline", children: "\u2190 Back to products" }), _jsx("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-10 text-center text-[#6B6480]", children: error ?? "Product not found" })] }));
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(Link, { to: "/products", className: "text-sm text-[#6D4AFF] hover:underline", children: "\u2190 Back to products" }), _jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-8 shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsx("h1", { className: "text-2xl font-bold text-[#1C1B1F]", children: product.name }), _jsx("p", { className: "mt-1 text-sm capitalize text-[#6B6480]", children: product.category }), _jsx("dl", { className: "mt-6 grid gap-4 sm:grid-cols-2", children: [
                            ["SKU", product.sku],
                            ["Brand", product.brand],
                            ["Color", product.color],
                            ["Material", product.material],
                        ].map(([label, value]) => (_jsxs("div", { children: [_jsx("dt", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: label }), _jsx("dd", { className: "mt-1 text-sm text-[#1C1B1F]", children: value ?? "—" })] }, label))) }), _jsxs("div", { className: "mt-8", children: [_jsx("h2", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: "Raw API payload" }), _jsx("pre", { className: "mt-2 overflow-x-auto rounded-xl bg-[#F4F3F8] p-4 text-xs text-[#1C1B1F]", children: JSON.stringify(product.raw, null, 2) })] })] })] }));
}
