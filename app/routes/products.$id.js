import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { createVariant, deleteVariant, formatVariantOption, getInventory, getManageProduct, productVariants, setInventory, updateProduct, updateVariant, uploadProductImage, uploadVariantImage, } from "~/lib/api";
import { useNotify } from "~/lib/notifications";
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const LOW_STOCK_THRESHOLD = 5;
const inputCls = "rounded-lg border border-[#E5E3EE] px-2 py-1.5 text-sm outline-none focus:border-[#6D4AFF]";
const fieldCls = "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";
export function meta() {
    return [{ title: "Product | Dupli1 Admin" }];
}
export default function ProductDetail() {
    const { id } = useParams();
    const [product, setProduct] = useState(null);
    const [variantRows, setVariantRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const loadProduct = useCallback(async () => {
        if (!id)
            return;
        const productId = id;
        setLoading(true);
        setError(null);
        try {
            const p = await getManageProduct(productId);
            const variants = productVariants(p);
            const rows = await Promise.all(variants.map(async (variant) => {
                try {
                    const stock = await getInventory(variant.sku);
                    return {
                        ...variant,
                        quantity: stock.quantity,
                        reserved: stock.reserved,
                    };
                }
                catch {
                    return { ...variant, quantity: null, reserved: null };
                }
            }));
            setProduct(p);
            setVariantRows(rows);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Product not found");
        }
        finally {
            setLoading(false);
        }
    }, [id]);
    useEffect(() => {
        void loadProduct();
    }, [loadProduct]);
    async function refreshVariantStock(sku) {
        try {
            const stock = await getInventory(sku);
            setVariantRows((rows) => rows.map((row) => row.sku === sku
                ? { ...row, quantity: stock.quantity, reserved: stock.reserved }
                : row));
        }
        catch {
            setVariantRows((rows) => rows.map((row) => row.sku === sku ? { ...row, quantity: null, reserved: null } : row));
        }
    }
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center py-32", children: _jsx("div", { className: "h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }) }));
    }
    if (error || !product) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsx(Link, { to: "/products", className: "text-sm text-[#6D4AFF] hover:underline", children: "\u2190 Back to products" }), _jsx("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-10 text-center text-[#6B6480]", children: error ?? "Product not found" })] }));
    }
    const hasMultipleVariants = (product.variants?.length ?? 0) > 1 ||
        variantRows.length > 1 ||
        Boolean(product.availableColors?.length);
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(Link, { to: "/products", className: "text-sm text-[#6D4AFF] hover:underline", children: "\u2190 Back to products" }), _jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8", children: [_jsx(ParentSummarySection, { product: product, onUpdated: setProduct }), _jsx(VariantsSection, { product: product, rows: variantRows, onStockUpdated: refreshVariantStock, onProductUpdated: setProduct, onReload: loadProduct }), !hasMultipleVariants && variantRows[0] && (_jsx(LegacyProductImages, { productId: product.id, variant: variantRows[0], onUploaded: setProduct }))] })] }));
}
function ParentSummarySection({ product, onUpdated, }) {
    const { notify } = useNotify();
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(product.name);
    const [brand, setBrand] = useState(product.brand ?? "");
    const [material, setMaterial] = useState(product.material ?? "");
    const [status, setStatus] = useState(product.status ?? "active");
    const [description, setDescription] = useState(product.description ?? "");
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        setName(product.name);
        setBrand(product.brand ?? "");
        setMaterial(product.material ?? "");
        setStatus(product.status ?? "active");
        setDescription(product.description ?? "");
    }, [product]);
    async function handleSubmit(e) {
        e.preventDefault();
        setSaving(true);
        try {
            const updated = await updateProduct(product.id, {
                name: name.trim(),
                brand: brand.trim(),
                material: material.trim(),
                status: status.trim() || "active",
                description: description.trim() || undefined,
            });
            onUpdated(updated);
            setEditing(false);
            notify("Product updated");
        }
        catch (err) {
            notify(err instanceof Error ? err.message : "Failed to update product", "error");
        }
        finally {
            setSaving(false);
        }
    }
    const colors = product.availableColors?.join(", ") ?? product.color ?? "—";
    const priceFrom = product.priceFrom != null
        ? formatCurrency(product.priceFrom)
        : product.price != null
            ? formatCurrency(product.price)
            : "—";
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-[#1C1B1F]", children: product.name }), _jsx("p", { className: "mt-1 text-sm capitalize text-[#6B6480]", children: product.category })] }), !editing && (_jsx("button", { type: "button", onClick: () => setEditing(true), className: "rounded-xl border border-[#E5E3EE] px-4 py-2 text-sm font-semibold text-[#6D4AFF] transition hover:border-[#6D4AFF]/40 hover:bg-[#FAFAFA]", children: "Edit style" }))] }), editing ? (_jsxs("form", { onSubmit: handleSubmit, className: "mt-6 space-y-4", children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: "Edit parent product" }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsxs("label", { className: "space-y-1.5 sm:col-span-2", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: "Name" }), _jsx("input", { required: true, value: name, onChange: (e) => setName(e.target.value), className: fieldCls })] }), _jsxs("label", { className: "space-y-1.5", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: "Brand" }), _jsx("input", { required: true, value: brand, onChange: (e) => setBrand(e.target.value), className: fieldCls })] }), _jsxs("label", { className: "space-y-1.5", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: "Material" }), _jsx("input", { required: true, value: material, onChange: (e) => setMaterial(e.target.value), className: fieldCls })] }), _jsxs("label", { className: "space-y-1.5", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: "Status" }), _jsxs("select", { value: status, onChange: (e) => setStatus(e.target.value), className: fieldCls, children: [_jsx("option", { value: "active", children: "Active" }), _jsx("option", { value: "inactive", children: "Inactive" }), _jsx("option", { value: "draft", children: "Draft" })] })] }), _jsxs("label", { className: "space-y-1.5 sm:col-span-2", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: "Description" }), _jsx("textarea", { value: description, onChange: (e) => setDescription(e.target.value), rows: 3, className: fieldCls })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "submit", disabled: saving, className: "rounded-xl bg-[#6D4AFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60", children: saving ? "Saving…" : "Save changes" }), _jsx("button", { type: "button", onClick: () => setEditing(false), className: "rounded-xl border border-[#E5E3EE] px-4 py-2 text-sm font-semibold text-[#6B6480]", children: "Cancel" })] })] })) : (_jsxs("dl", { className: "mt-6 grid gap-4 sm:grid-cols-2", children: [[
                        ["ID", product.id],
                        ["Brand", product.brand],
                        ["Material", product.material],
                        ["Status", product.status],
                        ["Colors", colors],
                        ["Price from", priceFrom],
                    ].map(([label, value]) => (_jsxs("div", { children: [_jsx("dt", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: label }), _jsx("dd", { className: "mt-1 text-sm text-[#1C1B1F]", children: value ?? "—" })] }, label))), product.description && (_jsxs("div", { className: "sm:col-span-2", children: [_jsx("dt", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: "Description" }), _jsx("dd", { className: "mt-1 text-sm text-[#1C1B1F]", children: product.description })] }))] }))] }));
}
function VariantsSection({ product, rows, onStockUpdated, onProductUpdated, onReload, }) {
    const { notify } = useNotify();
    const [editingSku, setEditingSku] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);
    async function handleSetStock(sku, quantity) {
        try {
            await setInventory(sku, quantity);
            await onStockUpdated(sku);
            notify(`Stock updated for ${sku}`);
        }
        catch (err) {
            notify(err instanceof Error ? err.message : "Failed to update stock", "error");
        }
    }
    return (_jsxs("div", { className: "mt-8 border-t border-[#F0EEF8] pt-6", children: [_jsxs("div", { className: "mb-4", children: [_jsx("h2", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: "Variants" }), _jsxs("p", { className: "mt-1 text-sm text-[#6B6480]", children: ["Sellable SKUs with inventory keyed by", " ", _jsxs("code", { className: "text-xs", children: ["/inventory/api/v1/inventory/", "{sku}"] })] })] }), _jsx("div", { className: "overflow-x-auto rounded-xl border border-[#E5E3EE]", children: _jsxs("table", { className: "w-full min-w-[640px] text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#F0EEF8] bg-[#FAFAFA] text-left", children: [
                                    "SKU",
                                    "Option",
                                    "Price",
                                    "Status",
                                    "Stock",
                                    "Images",
                                    "",
                                    "Actions",
                                ].map((heading) => (_jsx("th", { className: "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: heading }, heading))) }) }), _jsx("tbody", { children: rows.map((row) => (_jsxs(Fragment, { children: [_jsxs("tr", { className: "border-b border-[#F0EEF8] last:border-0 align-top", children: [_jsx("td", { className: "px-4 py-3 font-mono text-xs text-[#1C1B1F]", children: row.sku }), _jsx("td", { className: "px-4 py-3 text-[#6B6480]", children: formatVariantOption(row) }), _jsx("td", { className: "px-4 py-3 text-[#1C1B1F]", children: formatCurrency(row.price) }), _jsx("td", { className: "px-4 py-3 capitalize text-[#6B6480]", children: row.status }), _jsx("td", { className: "px-4 py-3", children: _jsx(StockEditor, { sku: row.sku, quantity: row.quantity, reserved: row.reserved, onSave: handleSetStock }) }), _jsx("td", { className: "px-4 py-3", children: _jsx(VariantImageUpload, { productId: product.id, variant: row, onUploaded: (updated) => {
                                                        onProductUpdated({
                                                            ...product,
                                                            variants: productVariants(product).map((v) => v.sku === updated.sku ? updated : v),
                                                        });
                                                    } }) }), _jsxs("td", { className: "px-4 py-3", children: [row.quantity === 0 && (_jsx("span", { className: "rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600", children: "Out" })), row.quantity != null &&
                                                        row.quantity > 0 &&
                                                        row.quantity <= LOW_STOCK_THRESHOLD && (_jsx("span", { className: "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700", children: "Low" }))] }), _jsx("td", { className: "px-4 py-3", children: _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "button", onClick: () => setEditingSku((current) => current === row.sku ? null : row.sku), className: "text-xs font-semibold text-[#6D4AFF] hover:underline", children: editingSku === row.sku ? "Cancel" : "Edit" }), _jsx("button", { type: "button", disabled: rows.length <= 1, title: rows.length <= 1
                                                                ? "Cannot delete the only variant"
                                                                : undefined, onClick: async () => {
                                                                if (!window.confirm(`Delete variant ${row.sku}? This cannot be undone.`)) {
                                                                    return;
                                                                }
                                                                try {
                                                                    await deleteVariant(product.id, row.sku);
                                                                    notify(`Deleted ${row.sku}`);
                                                                    setEditingSku(null);
                                                                    await onReload();
                                                                }
                                                                catch (err) {
                                                                    notify(err instanceof Error
                                                                        ? err.message
                                                                        : "Failed to delete variant", "error");
                                                                }
                                                            }, className: "text-xs font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40", children: "Delete" })] }) })] }), editingSku === row.sku && (_jsx("tr", { className: "bg-[#FAFAFA]", children: _jsx("td", { colSpan: 8, className: "px-4 py-4", children: _jsx(VariantEditForm, { productId: product.id, variant: row, onSaved: async () => {
                                                    setEditingSku(null);
                                                    await onReload();
                                                    notify(`Updated ${row.sku}`);
                                                }, onCancel: () => setEditingSku(null) }) }) }))] }, row.sku))) })] }) }), _jsx("div", { className: "mt-4", children: showAddForm ? (_jsx(AddVariantForm, { productId: product.id, onAdded: async () => {
                        setShowAddForm(false);
                        await onReload();
                        notify("Variant added");
                    }, onCancel: () => setShowAddForm(false) })) : (_jsx("button", { type: "button", onClick: () => setShowAddForm(true), className: "rounded-xl border border-dashed border-[#E5E3EE] px-4 py-2.5 text-sm font-semibold text-[#6D4AFF] transition hover:border-[#6D4AFF]/40 hover:bg-[#FAFAFA]", children: "+ Add variant" })) })] }));
}
function VariantEditForm({ productId, variant, onSaved, onCancel, }) {
    const { notify } = useNotify();
    const [color, setColor] = useState(variant.color);
    const [size, setSize] = useState(variant.size);
    const [price, setPrice] = useState(String(variant.price));
    const [status, setStatus] = useState(variant.status);
    const [saving, setSaving] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        const parsedPrice = Number.parseFloat(price);
        if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
            notify("Enter a valid price", "error");
            return;
        }
        setSaving(true);
        try {
            await updateVariant(productId, variant.sku, {
                color: color.trim(),
                size: size.trim(),
                price: parsedPrice,
                status: status.trim() || "active",
            });
            await onSaved();
        }
        catch (err) {
            notify(err instanceof Error ? err.message : "Failed to update variant", "error");
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsxs("form", { onSubmit: handleSubmit, className: "space-y-3", children: [_jsxs("p", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: ["Edit ", variant.sku] }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: ["Color", _jsx("input", { required: true, value: color, onChange: (e) => setColor(e.target.value), className: `block ${inputCls}` })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: ["Size", _jsx("input", { value: size, onChange: (e) => setSize(e.target.value), className: `block ${inputCls}` })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: ["Price", _jsx("input", { required: true, type: "number", min: 0, step: "0.01", value: price, onChange: (e) => setPrice(e.target.value), className: `block w-28 ${inputCls}` })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: ["Status", _jsxs("select", { value: status, onChange: (e) => setStatus(e.target.value), className: `block ${inputCls}`, children: [_jsx("option", { value: "active", children: "Active" }), _jsx("option", { value: "inactive", children: "Inactive" }), _jsx("option", { value: "draft", children: "Draft" })] })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "submit", disabled: saving, className: "rounded-lg bg-[#6D4AFF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60", children: saving ? "Saving…" : "Save changes" }), _jsx("button", { type: "button", onClick: onCancel, className: "rounded-lg bg-[#F4F3F8] px-3 py-1.5 text-xs font-semibold text-[#6B6480]", children: "Cancel" })] })] }));
}
function AddVariantForm({ productId, onAdded, onCancel, }) {
    const { notify } = useNotify();
    const [color, setColor] = useState("");
    const [size, setSize] = useState("");
    const [sku, setSku] = useState("");
    const [price, setPrice] = useState("");
    const [initialStock, setInitialStock] = useState("");
    const [status, setStatus] = useState("active");
    const [saving, setSaving] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        const parsedPrice = Number.parseFloat(price);
        if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
            notify("Enter a valid price", "error");
            return;
        }
        setSaving(true);
        try {
            const variant = await createVariant(productId, {
                color: color.trim(),
                size: size.trim(),
                price: parsedPrice,
                sku: sku.trim() || undefined,
                status,
            });
            const stockQty = Number.parseInt(initialStock, 10);
            if (!Number.isNaN(stockQty) && stockQty >= 0) {
                await setInventory(variant.sku, stockQty).catch(() => { });
            }
            await onAdded();
        }
        catch (err) {
            notify(err instanceof Error ? err.message : "Failed to add variant", "error");
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsxs("form", { onSubmit: handleSubmit, className: "rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] p-4 space-y-3", children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: "New variant" }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3", children: [_jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: ["Color *", _jsx("input", { required: true, value: color, onChange: (e) => setColor(e.target.value), className: `block w-full ${inputCls}`, placeholder: "Navy" })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: ["Size", _jsx("input", { value: size, onChange: (e) => setSize(e.target.value), className: `block w-full ${inputCls}` })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: ["SKU", _jsx("input", { value: sku, onChange: (e) => setSku(e.target.value), className: `block w-full ${inputCls}`, placeholder: "Auto-generated if empty" })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: ["Price (USD) *", _jsx("input", { required: true, type: "number", min: 0, step: "0.01", value: price, onChange: (e) => setPrice(e.target.value), className: `block w-full ${inputCls}` })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: ["Status", _jsxs("select", { value: status, onChange: (e) => setStatus(e.target.value), className: `block w-full ${inputCls}`, children: [_jsx("option", { value: "active", children: "Active" }), _jsx("option", { value: "inactive", children: "Inactive" }), _jsx("option", { value: "draft", children: "Draft" })] })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: ["Initial stock", _jsx("input", { type: "number", min: 0, value: initialStock, onChange: (e) => setInitialStock(e.target.value), className: `block w-full ${inputCls}`, placeholder: "Inventory for this SKU" })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "submit", disabled: saving, className: "rounded-lg bg-[#6D4AFF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60", children: saving ? "Adding…" : "Add variant" }), _jsx("button", { type: "button", onClick: onCancel, className: "rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#6B6480] border border-[#E5E3EE]", children: "Cancel" })] })] }));
}
function StockEditor({ sku, quantity, reserved, onSave, }) {
    const [value, setValue] = useState(quantity != null ? String(quantity) : "");
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        setValue(quantity != null ? String(quantity) : "");
    }, [quantity]);
    async function handleSubmit(e) {
        e.preventDefault();
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed < 0)
            return;
        setSaving(true);
        try {
            await onSave(sku, parsed);
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsxs("form", { onSubmit: handleSubmit, className: "flex items-center gap-2", children: [_jsx("input", { type: "number", min: 0, value: value, onChange: (e) => setValue(e.target.value), placeholder: "\u2014", className: "w-20 rounded-lg border border-[#E5E3EE] px-2 py-1 text-sm outline-none focus:border-[#6D4AFF]" }), _jsx("button", { type: "submit", disabled: saving, className: "rounded-lg bg-[#F4F3F8] px-2 py-1 text-xs font-semibold text-[#6D4AFF] hover:bg-[#E5E3EE] disabled:opacity-60", children: saving ? "…" : "Set" }), reserved != null && reserved > 0 && (_jsxs("span", { className: "text-xs text-[#9D98B3]", children: [reserved, " reserved"] }))] }));
}
function VariantImageUpload({ productId, variant, onUploaded, }) {
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
            notify("Image must be 50 MiB or smaller", "error");
            e.target.value = "";
            return;
        }
        setUploading(true);
        try {
            const updated = await uploadVariantImage(productId, variant.sku, file);
            onUploaded(updated);
            notify("Variant image uploaded");
        }
        catch (err) {
            notify(err instanceof Error ? err.message : "Upload failed", "error");
        }
        finally {
            setUploading(false);
            e.target.value = "";
        }
    }
    return (_jsxs("div", { children: [_jsx("input", { ref: inputRef, type: "file", accept: "image/*", className: "hidden", onChange: handleFileChange, disabled: uploading }), _jsx("button", { type: "button", onClick: () => inputRef.current?.click(), disabled: uploading, className: "text-xs font-semibold text-[#6D4AFF] hover:underline disabled:opacity-60", children: uploading ? "Uploading…" : `Upload (${variant.imageUrls.length})` })] }));
}
function LegacyProductImages({ productId, variant, onUploaded, }) {
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
            notify("Image must be 50 MiB or smaller", "error");
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
    const imageUrls = variant.imageUrls;
    return (_jsxs("div", { className: "mt-6 border-t border-[#F0EEF8] pt-6", children: [_jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: "Images" }), _jsx("p", { className: "mt-1 text-sm text-[#6B6480]", children: "Legacy parent upload or variant upload when multi-SKU is enabled" })] }), _jsxs("div", { children: [_jsx("input", { ref: inputRef, type: "file", accept: "image/*", className: "hidden", onChange: handleFileChange, disabled: uploading }), _jsx("button", { type: "button", onClick: () => inputRef.current?.click(), disabled: uploading, className: "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60 sm:w-auto", children: uploading ? "Uploading…" : "Upload image" })] })] }), imageUrls.length > 0 ? (_jsx("div", { className: "mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", children: imageUrls.map((url) => (_jsx("a", { href: url, target: "_blank", rel: "noopener noreferrer", className: "group overflow-hidden rounded-xl border border-[#E5E3EE] bg-[#FAFAFA]", children: _jsx("img", { src: url, alt: "", className: "aspect-square w-full object-cover transition group-hover:scale-105" }) }, url))) })) : (_jsx("div", { className: "mt-4 rounded-xl border border-dashed border-[#E5E3EE] bg-[#FAFAFA] px-4 py-10 text-center text-sm text-[#9D98B3]", children: "No images yet." }))] }));
}
function formatCurrency(n) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
    }).format(n);
}
