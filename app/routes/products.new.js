import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { createBagProduct } from "~/lib/api";
import { useNotify } from "~/lib/notifications";
export function meta() {
    return [{ title: "New Product | Dupli1 Admin" }];
}
const inputCls = "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";
export default function NewProduct() {
    const navigate = useNavigate();
    const { notify } = useNotify();
    const [title, setTitle] = useState("");
    const [sku, setSku] = useState("");
    const [brand, setBrand] = useState("");
    const [color, setColor] = useState("");
    const [material, setMaterial] = useState("");
    const [loading, setLoading] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);
        try {
            const product = await createBagProduct({
                title: title.trim(),
                sku: sku.trim(),
                brand: brand.trim(),
                color: color.trim(),
                material: material.trim(),
            });
            notify(`Product created: ${product.name}`);
            navigate(`/products/${encodeURIComponent(product.id)}?category=${encodeURIComponent(product.category)}`);
        }
        catch (err) {
            notify(err instanceof Error ? err.message : "Failed to create product", "error");
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs("div", { className: "mx-auto max-w-lg space-y-6", children: [_jsx(Link, { to: "/products", className: "text-sm text-[#6D4AFF] hover:underline", children: "\u2190 Back to products" }), _jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-[#1C1B1F] sm:text-2xl", children: "New product" }), _jsxs("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: ["Add a bag to the catalog via", " ", _jsx("code", { className: "text-xs", children: "POST /product/api/v1/products/bags" })] })] }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4 rounded-2xl border border-[#E5E3EE] bg-white p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsx(Field, { label: "Title", id: "title", required: true, children: _jsx("input", { id: "title", type: "text", required: true, value: title, onChange: (e) => setTitle(e.target.value), className: inputCls, placeholder: "Leather tote bag" }) }), _jsx(Field, { label: "SKU", id: "sku", required: true, children: _jsx("input", { id: "sku", type: "text", required: true, value: sku, onChange: (e) => setSku(e.target.value), className: inputCls, placeholder: "BAG-001" }) }), _jsx(Field, { label: "Brand", id: "brand", required: true, children: _jsx("input", { id: "brand", type: "text", required: true, value: brand, onChange: (e) => setBrand(e.target.value), className: inputCls, placeholder: "Dupli1" }) }), _jsx(Field, { label: "Color", id: "color", required: true, children: _jsx("input", { id: "color", type: "text", required: true, value: color, onChange: (e) => setColor(e.target.value), className: inputCls, placeholder: "Black" }) }), _jsx(Field, { label: "Material", id: "material", required: true, children: _jsx("input", { id: "material", type: "text", required: true, value: material, onChange: (e) => setMaterial(e.target.value), className: inputCls, placeholder: "Leather" }) }), _jsx("button", { type: "submit", disabled: loading, className: "w-full rounded-xl bg-[#6D4AFF] py-3 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60", children: loading ? "Creating…" : "Create product" })] })] }));
}
function Field({ label, id, required, children, }) {
    return (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("label", { htmlFor: id, className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: [label, required && _jsx("span", { className: "text-red-500", children: " *" })] }), children] }));
}
