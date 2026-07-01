import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { getManageProduct, getProduct, uploadProductImage, } from "~/lib/api";
import { useNotify } from "~/lib/notifications";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export function meta() {
    return [{ title: "Product | Dupli1 Admin" }];
}
export default function ProductDetail() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const category = searchParams.get("category") ?? "bags";
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!id)
            return;
        const productId = id;
        let cancelled = false;
        setLoading(true);
        setError(null);
        async function load() {
            try {
                const p = await getManageProduct(productId);
                if (!cancelled)
                    setProduct(p);
            }
            catch {
                try {
                    const p = await getProduct(category, productId);
                    if (!p)
                        throw new Error("Product not found");
                    if (!cancelled)
                        setProduct(p);
                }
                catch (err) {
                    if (!cancelled) {
                        setError(err instanceof Error ? err.message : "Product not found");
                    }
                }
            }
            finally {
                if (!cancelled)
                    setLoading(false);
            }
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, [id, category]);
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center py-32", children: _jsx("div", { className: "h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }) }));
    }
    if (error || !product) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsx(Link, { to: "/products", className: "text-sm text-[#6D4AFF] hover:underline", children: "\u2190 Back to products" }), _jsx("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-10 text-center text-[#6B6480]", children: error ?? "Product not found" })] }));
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(Link, { to: "/products", className: "text-sm text-[#6D4AFF] hover:underline", children: "\u2190 Back to products" }), _jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8", children: [_jsx("h1", { className: "text-2xl font-bold text-[#1C1B1F]", children: product.name }), _jsx("p", { className: "mt-1 text-sm capitalize text-[#6B6480]", children: product.category }), _jsx(ProductImages, { productId: product.id, imageUrls: product.imageUrls ?? [], onUploaded: setProduct }), _jsx("dl", { className: "mt-6 grid gap-4 sm:grid-cols-2", children: [
                            ["ID", product.id],
                            ["SKU", product.sku],
                            ["Brand", product.brand],
                            ["Color", product.color],
                            ["Material", product.material],
                            ["Status", product.status],
                        ].map(([label, value]) => (_jsxs("div", { children: [_jsx("dt", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: label }), _jsx("dd", { className: "mt-1 text-sm text-[#1C1B1F]", children: value ?? "—" })] }, label))) }), _jsxs("div", { className: "mt-8", children: [_jsx("h2", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: "Raw API payload" }), _jsx("pre", { className: "mt-2 overflow-x-auto rounded-xl bg-[#F4F3F8] p-4 text-xs text-[#1C1B1F]", children: JSON.stringify(product.raw, null, 2) })] })] })] }));
}
function ProductImages({ productId, imageUrls, onUploaded, }) {
    const { notify } = useNotify();
    const inputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    async function handleFileChange(e) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        if (!file.type.startsWith("image/")) {
            notify("Please choose an image file", "error");
            e.target.value = "";
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            notify("Image must be 10 MB or smaller", "error");
            e.target.value = "";
            return;
        }
        setUploading(true);
        try {
            const updated = await uploadProductImage(productId, file);
            onUploaded(updated);
            notify("Image uploaded");
        }
        catch (err) {
            notify(err instanceof Error ? err.message : "Upload failed", "error");
        }
        finally {
            setUploading(false);
            e.target.value = "";
        }
    }
    return (_jsxs("div", { className: "mt-6 border-t border-[#F0EEF8] pt-6", children: [_jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: "Images" }), _jsxs("p", { className: "mt-1 text-sm text-[#6B6480]", children: ["Uploads to S3 via", " ", _jsxs("code", { className: "text-xs", children: ["PUT /product/api/v1/products/", "{id}", "/image"] })] })] }), _jsxs("div", { children: [_jsx("input", { ref: inputRef, type: "file", accept: "image/*", className: "hidden", onChange: handleFileChange, disabled: uploading }), _jsx("button", { type: "button", onClick: () => inputRef.current?.click(), disabled: uploading, className: "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60 sm:w-auto", children: uploading ? "Uploading…" : "Upload image" })] })] }), imageUrls.length > 0 ? (_jsx("div", { className: "mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", children: imageUrls.map((url) => (_jsx("a", { href: url, target: "_blank", rel: "noopener noreferrer", className: "group overflow-hidden rounded-xl border border-[#E5E3EE] bg-[#FAFAFA]", children: _jsx("img", { src: url, alt: "", className: "aspect-square w-full object-cover transition group-hover:scale-105" }) }, url))) })) : (_jsx("div", { className: "mt-4 rounded-xl border border-dashed border-[#E5E3EE] bg-[#FAFAFA] px-4 py-10 text-center text-sm text-[#9D98B3]", children: "No images yet. Upload a product photo to store it in the image bucket." }))] }));
}
