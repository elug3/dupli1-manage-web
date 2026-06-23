import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router";
export function meta() {
    return [{ title: "New Product | Schick Admin" }];
}
export default function NewProduct() {
    return (_jsxs("div", { className: "space-y-4", children: [_jsx(Link, { to: "/products", className: "text-sm text-[#6D4AFF] hover:underline", children: "\u2190 Back to products" }), _jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-12 text-center shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsx("h1", { className: "text-xl font-bold text-[#1C1B1F]", children: "Product creation unavailable" }), _jsx("p", { className: "mt-2 text-sm text-[#6B6480]", children: "The product service exposes read-only search endpoints. Use the catalog browser to inspect items by category." })] })] }));
}
