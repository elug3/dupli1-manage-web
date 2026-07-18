import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { createVariant, deleteVariant, deleteVariantImage, LastImageDeleteError, formatVariantOption, getInventory, getManageProduct, listColors, listEditions, listSizes, productImageSrc, productSkuPath, productVariants, setInventory, updateProduct, updateVariant, uploadProductImage, uploadVariantImage, } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
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
    const { t } = useI18n();
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
            setError(err instanceof Error ? err.message : t("productDetail.productNotFound"));
        }
        finally {
            setLoading(false);
        }
    }, [id, t]);
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
        return (_jsxs("div", { className: "space-y-4", children: [_jsx(Link, { to: "/products", className: "text-sm text-[#6D4AFF] hover:underline", children: t("productDetail.backToProducts") }), _jsx("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-10 text-center text-[#6B6480]", children: error ?? t("productDetail.productNotFound") })] }));
    }
    const hasMultipleVariants = (product.variants?.length ?? 0) > 1 ||
        variantRows.length > 1 ||
        Boolean(product.availableColors?.length);
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(Link, { to: "/products", className: "text-sm text-[#6D4AFF] hover:underline", children: t("productDetail.backToProducts") }), _jsxs("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8", children: [_jsx(ParentSummarySection, { product: product, onUpdated: setProduct }), _jsx(VariantsSection, { product: product, rows: variantRows, onStockUpdated: refreshVariantStock, onProductUpdated: setProduct, onReload: loadProduct }), !hasMultipleVariants && variantRows[0] && (_jsx(LegacyProductImages, { productId: product.id, variant: variantRows[0], onUploaded: setProduct }))] })] }));
}
function ParentSummarySection({ product, onUpdated, }) {
    const { notify } = useNotify();
    const { t, formatCurrency } = useI18n();
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
            notify(t("productDetail.productUpdated"));
        }
        catch (err) {
            notify(err instanceof Error
                ? err.message
                : t("productDetail.failedToUpdateProduct"), "error");
        }
        finally {
            setSaving(false);
        }
    }
    const colors = product.availableColors?.join(", ") ??
        product.color ??
        t("common.emptyValue");
    const priceFrom = product.priceFrom != null
        ? formatCurrency(product.priceFrom)
        : product.price != null
            ? formatCurrency(product.price)
            : t("common.emptyValue");
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-[#1C1B1F]", children: product.name }), _jsx("p", { className: "mt-1 text-sm capitalize text-[#6B6480]", children: product.category })] }), !editing && (_jsx("button", { type: "button", onClick: () => setEditing(true), className: "rounded-xl border border-[#E5E3EE] px-4 py-2 text-sm font-semibold text-[#6D4AFF] transition hover:border-[#6D4AFF]/40 hover:bg-[#FAFAFA]", children: t("productDetail.editStyle") }))] }), editing ? (_jsxs("form", { onSubmit: handleSubmit, className: "mt-6 space-y-4", children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("productDetail.editParentProduct") }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsxs("label", { className: "space-y-1.5 sm:col-span-2", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: t("productDetail.name") }), _jsx("input", { required: true, value: name, onChange: (e) => setName(e.target.value), className: fieldCls })] }), _jsxs("label", { className: "space-y-1.5", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: t("productDetail.brand") }), _jsx("input", { required: true, value: brand, onChange: (e) => setBrand(e.target.value), className: fieldCls })] }), _jsxs("label", { className: "space-y-1.5", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: t("productDetail.material") }), _jsx("input", { required: true, value: material, onChange: (e) => setMaterial(e.target.value), className: fieldCls })] }), _jsxs("label", { className: "space-y-1.5", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: t("productDetail.status") }), _jsxs("select", { value: status, onChange: (e) => setStatus(e.target.value), className: fieldCls, children: [_jsx("option", { value: "active", children: t("common.statusActive") }), _jsx("option", { value: "draft", children: t("common.statusDraft") }), _jsx("option", { value: "archived", children: t("common.statusArchived") })] })] }), _jsxs("label", { className: "space-y-1.5 sm:col-span-2", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: t("productDetail.description") }), _jsx("textarea", { value: description, onChange: (e) => setDescription(e.target.value), rows: 3, className: fieldCls })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "submit", disabled: saving, className: "rounded-xl bg-[#6D4AFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60", children: saving ? t("common.saving") : t("common.saveChanges") }), _jsx("button", { type: "button", onClick: () => setEditing(false), className: "rounded-xl border border-[#E5E3EE] px-4 py-2 text-sm font-semibold text-[#6B6480]", children: t("common.cancel") })] })] })) : (_jsxs("dl", { className: "mt-6 grid gap-4 sm:grid-cols-2", children: [[
                        [t("productDetail.id"), product.id],
                        [t("productDetail.brand"), product.brand],
                        [t("productDetail.brandCode"), product.brandCode],
                        [t("productDetail.styleCode"), product.styleCode],
                        [t("productDetail.material"), product.material],
                        [t("productDetail.status"), product.status],
                        [t("productDetail.colors"), colors],
                        [t("productDetail.priceFrom"), priceFrom],
                    ].map(([label, value]) => (_jsxs("div", { children: [_jsx("dt", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: label }), _jsx("dd", { className: "mt-1 text-sm text-[#1C1B1F]", children: value ?? t("common.emptyValue") })] }, label))), product.description && (_jsxs("div", { className: "sm:col-span-2", children: [_jsx("dt", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("productDetail.description") }), _jsx("dd", { className: "mt-1 text-sm text-[#1C1B1F]", children: product.description })] }))] }))] }));
}
function VariantsSection({ product, rows, onStockUpdated, onProductUpdated, onReload, }) {
    const { notify } = useNotify();
    const { t, formatCurrency } = useI18n();
    const [editingSku, setEditingSku] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);
    async function handleSetStock(sku, quantity) {
        try {
            await setInventory(sku, quantity);
            await onStockUpdated(sku);
            notify(t("productDetail.stockUpdatedFor", { sku }));
        }
        catch (err) {
            notify(err instanceof Error
                ? err.message
                : t("productDetail.failedToUpdateStock"), "error");
        }
    }
    const headings = [
        t("productDetail.colSku"),
        t("productDetail.colSkuId"),
        t("productDetail.colOption"),
        t("productDetail.colPrice"),
        t("productDetail.colStatus"),
        t("productDetail.colStock"),
        t("productDetail.colImages"),
        "",
        t("productDetail.colActions"),
    ];
    return (_jsxs("div", { className: "mt-8 border-t border-[#F0EEF8] pt-6", children: [_jsxs("div", { className: "mb-4", children: [_jsx("h2", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("productDetail.variants") }), _jsx("p", { className: "mt-1 text-sm text-[#6B6480]", children: t("productDetail.variantsHint") })] }), _jsx("div", { className: "overflow-x-auto rounded-xl border border-[#E5E3EE]", children: _jsxs("table", { className: "w-full min-w-[720px] text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#F0EEF8] bg-[#FAFAFA] text-left", children: headings.map((heading, index) => (_jsx("th", { className: "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: heading }, heading || `spacer-${index}`))) }) }), _jsx("tbody", { children: rows.map((row) => (_jsxs(Fragment, { children: [_jsxs("tr", { className: "border-b border-[#F0EEF8] last:border-0 align-top", children: [_jsx("td", { className: "px-4 py-3 font-mono text-xs text-[#1C1B1F]", children: _jsx(Link, { to: productSkuPath(product.id, row.skuId ?? row.sku), className: "text-[#6D4AFF] hover:underline", children: row.sku }) }), _jsx("td", { className: "px-4 py-3 font-mono text-[10px] text-[#9D98B3]", children: row.skuId ? (_jsx(Link, { to: productSkuPath(product.id, row.skuId), className: "hover:text-[#6D4AFF] hover:underline", children: row.skuId })) : (t("common.emptyValue")) }), _jsxs("td", { className: "px-4 py-3 text-[#6B6480]", children: [formatVariantOption(row), (row.colorCode || row.sizeCode || row.editionCode) && (_jsx("div", { className: "mt-0.5 font-mono text-[10px] text-[#9D98B3]", children: [row.colorCode, row.editionCode, row.sizeCode]
                                                            .filter(Boolean)
                                                            .join(" · ") }))] }), _jsx("td", { className: "px-4 py-3 text-[#1C1B1F]", children: formatCurrency(row.price) }), _jsx("td", { className: "px-4 py-3 capitalize text-[#6B6480]", children: row.status }), _jsx("td", { className: "px-4 py-3", children: _jsx(StockEditor, { sku: row.sku, quantity: row.quantity, reserved: row.reserved, onSave: handleSetStock }) }), _jsx("td", { className: "px-4 py-3", children: _jsx(VariantImageUpload, { productId: product.id, variant: row, onUploaded: (updated) => {
                                                        onProductUpdated({
                                                            ...product,
                                                            variants: productVariants(product).map((v) => v.sku === updated.sku ? updated : v),
                                                        });
                                                    } }) }), _jsxs("td", { className: "px-4 py-3", children: [row.quantity === 0 && (_jsx("span", { className: "rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600", children: t("productDetail.stockOut") })), row.quantity != null &&
                                                        row.quantity > 0 &&
                                                        row.quantity <= LOW_STOCK_THRESHOLD && (_jsx("span", { className: "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700", children: t("productDetail.stockLow") }))] }), _jsx("td", { className: "px-4 py-3", children: _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "button", onClick: () => setEditingSku((current) => current === row.sku ? null : row.sku), className: "text-xs font-semibold text-[#6D4AFF] hover:underline", children: editingSku === row.sku
                                                                ? t("common.cancel")
                                                                : t("common.edit") }), _jsx(Link, { to: productSkuPath(product.id, row.skuId ?? row.sku), className: "text-xs font-semibold text-[#6D4AFF] hover:underline", children: t("skuDetail.open") }), _jsx("button", { type: "button", disabled: rows.length <= 1, title: rows.length <= 1
                                                                ? t("productDetail.cannotDeleteOnlyVariant")
                                                                : undefined, onClick: async () => {
                                                                if (!window.confirm(t("productDetail.deleteVariantConfirm", {
                                                                    sku: row.sku,
                                                                }))) {
                                                                    return;
                                                                }
                                                                try {
                                                                    await deleteVariant(product.id, row.sku);
                                                                    notify(t("productDetail.deletedSku", { sku: row.sku }));
                                                                    setEditingSku(null);
                                                                    await onReload();
                                                                }
                                                                catch (err) {
                                                                    notify(err instanceof Error
                                                                        ? err.message
                                                                        : t("productDetail.failedToDeleteVariant"), "error");
                                                                }
                                                            }, className: "text-xs font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40", children: t("common.delete") })] }) })] }), editingSku === row.sku && (_jsx("tr", { className: "bg-[#FAFAFA]", children: _jsx("td", { colSpan: 9, className: "px-4 py-4", children: _jsx(VariantEditForm, { productId: product.id, variant: row, onSaved: async () => {
                                                    setEditingSku(null);
                                                    await onReload();
                                                    notify(t("productDetail.updatedSku", { sku: row.sku }));
                                                }, onCancel: () => setEditingSku(null) }) }) }))] }, row.sku))) })] }) }), _jsx("div", { className: "mt-4", children: showAddForm ? (_jsx(AddVariantForm, { productId: product.id, onAdded: async () => {
                        setShowAddForm(false);
                        await onReload();
                        notify(t("productDetail.variantAdded"));
                    }, onCancel: () => setShowAddForm(false) })) : (_jsx("button", { type: "button", onClick: () => setShowAddForm(true), className: "rounded-xl border border-dashed border-[#E5E3EE] px-4 py-2.5 text-sm font-semibold text-[#6D4AFF] transition hover:border-[#6D4AFF]/40 hover:bg-[#FAFAFA]", children: t("productDetail.addVariant") })) })] }));
}
function VariantEditForm({ productId, variant, onSaved, onCancel, }) {
    const { notify } = useNotify();
    const { t } = useI18n();
    const [color, setColor] = useState(variant.color);
    const [size, setSize] = useState(variant.size);
    const [price, setPrice] = useState(String(variant.price));
    const [status, setStatus] = useState(variant.status);
    const [saving, setSaving] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        const parsedPrice = Number.parseFloat(price);
        if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
            notify(t("common.enterValidPrice"), "error");
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
            notify(err instanceof Error
                ? err.message
                : t("productDetail.failedToUpdateVariant"), "error");
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsxs("form", { onSubmit: handleSubmit, className: "space-y-3", children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("productDetail.editVariantHeading", { sku: variant.sku }) }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: [t("productDetail.color"), _jsx("input", { required: true, value: color, onChange: (e) => setColor(e.target.value), className: `block ${inputCls}` })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: [t("productDetail.size"), _jsx("input", { value: size, onChange: (e) => setSize(e.target.value), className: `block ${inputCls}` })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: [t("productDetail.price"), _jsx("input", { required: true, type: "number", min: 0, step: "1", value: price, onChange: (e) => setPrice(e.target.value), className: `block w-28 ${inputCls}` })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: [t("productDetail.status"), _jsxs("select", { value: status, onChange: (e) => setStatus(e.target.value), className: `block ${inputCls}`, children: [_jsx("option", { value: "active", children: t("common.statusActive") }), _jsx("option", { value: "draft", children: t("common.statusDraft") }), _jsx("option", { value: "archived", children: t("common.statusArchived") })] })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "submit", disabled: saving, className: "rounded-lg bg-[#6D4AFF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60", children: saving ? t("common.saving") : t("common.saveChanges") }), _jsx("button", { type: "button", onClick: onCancel, className: "rounded-lg bg-[#F4F3F8] px-3 py-1.5 text-xs font-semibold text-[#6B6480]", children: t("common.cancel") })] })] }));
}
function AddVariantForm({ productId, onAdded, onCancel, }) {
    const { notify } = useNotify();
    const { t } = useI18n();
    const [colors, setColors] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [editions, setEditions] = useState([]);
    const [colorCode, setColorCode] = useState("");
    const [sizeCode, setSizeCode] = useState("OS");
    const [editionCode, setEditionCode] = useState("");
    const [price, setPrice] = useState("");
    const [initialStock, setInitialStock] = useState("");
    const [status, setStatus] = useState("active");
    const [saving, setSaving] = useState(false);
    const [loadingMasters, setLoadingMasters] = useState(true);
    useEffect(() => {
        let cancelled = false;
        Promise.all([listColors(), listSizes(), listEditions()])
            .then(([c, s, e]) => {
            if (cancelled)
                return;
            setColors(c);
            setSizes(s);
            setEditions(e);
            if (c[0])
                setColorCode(c[0].code);
            if (s.some((row) => row.code === "OS"))
                setSizeCode("OS");
            else if (s[0])
                setSizeCode(s[0].code);
        })
            .catch((err) => {
            if (!cancelled) {
                notify(err instanceof Error
                    ? err.message
                    : t("common.failedToLoadCatalogMasters"), "error");
            }
        })
            .finally(() => {
            if (!cancelled)
                setLoadingMasters(false);
        });
        return () => {
            cancelled = true;
        };
    }, [notify, t]);
    async function handleSubmit(e) {
        e.preventDefault();
        const parsedPrice = Number.parseFloat(price);
        if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
            notify(t("common.enterValidPrice"), "error");
            return;
        }
        if (!colorCode || !sizeCode) {
            notify(t("productDetail.selectColorAndSizeCodes"), "error");
            return;
        }
        setSaving(true);
        try {
            const colorName = colors.find((c) => c.code === colorCode)?.name;
            const sizeName = sizes.find((s) => s.code === sizeCode)?.name;
            const variant = await createVariant(productId, {
                colorCode,
                sizeCode,
                editionCode: editionCode || undefined,
                color: colorName,
                size: sizeName,
                price: parsedPrice,
                status,
            });
            const stockQty = Number.parseInt(initialStock, 10);
            if (!Number.isNaN(stockQty) && stockQty >= 0) {
                await setInventory(variant.sku, stockQty).catch(() => { });
            }
            await onAdded();
        }
        catch (err) {
            notify(err instanceof Error
                ? err.message
                : t("productDetail.failedToAddVariant"), "error");
        }
        finally {
            setSaving(false);
        }
    }
    if (loadingMasters) {
        return (_jsx("div", { className: "rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] p-4 text-sm text-[#6B6480]", children: t("productDetail.loadingCatalogMasters") }));
    }
    return (_jsxs("form", { onSubmit: handleSubmit, className: "rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] p-4 space-y-3", children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("productDetail.newVariant") }), _jsx("p", { className: "text-xs text-[#6B6480]", children: t("productDetail.newVariantHint") }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3", children: [_jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: [t("productDetail.colorCodeRequired"), _jsx("select", { required: true, value: colorCode, onChange: (e) => setColorCode(e.target.value), className: `block w-full ${inputCls}`, children: colors.map((c) => (_jsxs("option", { value: c.code, children: [c.code, " \u2014 ", c.name] }, c.code))) })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: [t("productDetail.sizeCodeRequired"), _jsx("select", { required: true, value: sizeCode, onChange: (e) => setSizeCode(e.target.value), className: `block w-full ${inputCls}`, children: sizes.map((s) => (_jsxs("option", { value: s.code, children: [s.code, " \u2014 ", s.name] }, s.code))) })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: [t("productDetail.editionCode"), _jsxs("select", { value: editionCode, onChange: (e) => setEditionCode(e.target.value), className: `block w-full ${inputCls}`, children: [_jsx("option", { value: "", children: t("common.none") }), editions.map((ed) => (_jsxs("option", { value: ed.code, children: [ed.code, " \u2014 ", ed.name] }, ed.code)))] })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: [t("productDetail.priceKrwRequired"), _jsx("input", { required: true, type: "number", min: 0, step: "1", value: price, onChange: (e) => setPrice(e.target.value), className: `block w-full ${inputCls}` })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: [t("productDetail.status"), _jsxs("select", { value: status, onChange: (e) => setStatus(e.target.value), className: `block w-full ${inputCls}`, children: [_jsx("option", { value: "active", children: t("common.statusActive") }), _jsx("option", { value: "draft", children: t("common.statusDraft") }), _jsx("option", { value: "archived", children: t("common.statusArchived") })] })] }), _jsxs("label", { className: "space-y-1 text-xs text-[#6B6480]", children: [t("productDetail.initialStock"), _jsx("input", { type: "number", min: 0, value: initialStock, onChange: (e) => setInitialStock(e.target.value), className: `block w-full ${inputCls}`, placeholder: t("productDetail.initialStockPlaceholder") })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "submit", disabled: saving, className: "rounded-lg bg-[#6D4AFF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60", children: saving ? t("common.adding") : t("productDetail.addVariant") }), _jsx("button", { type: "button", onClick: onCancel, className: "rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#6B6480] border border-[#E5E3EE]", children: t("common.cancel") })] })] }));
}
function StockEditor({ sku, quantity, reserved, onSave, }) {
    const { t } = useI18n();
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
    return (_jsxs("form", { onSubmit: handleSubmit, className: "flex items-center gap-2", children: [_jsx("input", { type: "number", min: 0, value: value, onChange: (e) => setValue(e.target.value), placeholder: t("common.emptyValue"), className: "w-20 rounded-lg border border-[#E5E3EE] px-2 py-1 text-sm outline-none focus:border-[#6D4AFF]" }), _jsx("button", { type: "submit", disabled: saving, className: "rounded-lg bg-[#F4F3F8] px-2 py-1 text-xs font-semibold text-[#6D4AFF] hover:bg-[#E5E3EE] disabled:opacity-60", children: saving ? t("common.loadingEllipsis") : t("productDetail.setStock") }), reserved != null && reserved > 0 && (_jsx("span", { className: "text-xs text-[#9D98B3]", children: t("common.reservedCount", { count: reserved }) }))] }));
}
function VariantImageUpload({ productId, variant, onUploaded, }) {
    const { notify } = useNotify();
    const { t } = useI18n();
    const inputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const [deletingUrl, setDeletingUrl] = useState(null);
    async function handleFileChange(e) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        if (!file.type.startsWith("image/")) {
            notify(t("common.pleaseChooseImageFile"), "error");
            e.target.value = "";
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            notify(t("common.imageMustBe50MiBOrSmaller"), "error");
            e.target.value = "";
            return;
        }
        setUploading(true);
        try {
            const updated = await uploadVariantImage(productId, variant.sku, file);
            onUploaded(updated);
            notify(t("productDetail.variantImageUploaded"));
        }
        catch (err) {
            notify(err instanceof Error ? err.message : t("productDetail.uploadFailed"), "error");
        }
        finally {
            setUploading(false);
            e.target.value = "";
        }
    }
    async function handleDelete(url) {
        if (!window.confirm(t("productDetail.deleteImageConfirm")))
            return;
        setDeletingUrl(url);
        try {
            const updated = await deleteVariantImage(productId, variant.sku, url, variant.imageUrls);
            onUploaded(updated);
            notify(t("productDetail.imageDeleted"));
        }
        catch (err) {
            notify(err instanceof LastImageDeleteError
                ? t("productDetail.cannotDeleteLastImage")
                : err instanceof Error
                    ? err.message
                    : t("productDetail.failedToDeleteImage"), "error");
        }
        finally {
            setDeletingUrl(null);
        }
    }
    return (_jsxs("div", { className: "space-y-2", children: [variant.imageUrls.length > 0 && (_jsx(ProductImageGrid, { urls: variant.imageUrls, deletingUrl: deletingUrl, onDelete: handleDelete, compact: true })), _jsx("input", { ref: inputRef, type: "file", accept: "image/*", className: "hidden", onChange: handleFileChange, disabled: uploading }), _jsx("button", { type: "button", onClick: () => inputRef.current?.click(), disabled: uploading, className: "text-xs font-semibold text-[#6D4AFF] hover:underline disabled:opacity-60", children: uploading
                    ? t("common.uploading")
                    : t("productDetail.uploadWithCount", {
                        count: variant.imageUrls.length,
                    }) })] }));
}
function LegacyProductImages({ productId, variant, onUploaded, }) {
    const { notify } = useNotify();
    const { t } = useI18n();
    const inputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const [deletingUrl, setDeletingUrl] = useState(null);
    async function handleFileChange(e) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        if (!file.type.startsWith("image/")) {
            notify(t("common.pleaseChooseImageFile"), "error");
            e.target.value = "";
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            notify(t("common.imageMustBe50MiBOrSmaller"), "error");
            e.target.value = "";
            return;
        }
        setUploading(true);
        try {
            const updated = await uploadProductImage(productId, file);
            onUploaded(updated);
            notify(t("productDetail.imageUploaded"));
        }
        catch (err) {
            notify(err instanceof Error ? err.message : t("productDetail.uploadFailed"), "error");
        }
        finally {
            setUploading(false);
            e.target.value = "";
        }
    }
    async function handleDelete(url) {
        if (!window.confirm(t("productDetail.deleteImageConfirm")))
            return;
        setDeletingUrl(url);
        try {
            await deleteVariantImage(productId, variant.sku, url, variant.imageUrls);
            const refreshed = await getManageProduct(productId);
            onUploaded(refreshed);
            notify(t("productDetail.imageDeleted"));
        }
        catch (err) {
            notify(err instanceof LastImageDeleteError
                ? t("productDetail.cannotDeleteLastImage")
                : err instanceof Error
                    ? err.message
                    : t("productDetail.failedToDeleteImage"), "error");
        }
        finally {
            setDeletingUrl(null);
        }
    }
    const imageUrls = variant.imageUrls;
    return (_jsxs("div", { className: "mt-6 border-t border-[#F0EEF8] pt-6", children: [_jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("productDetail.images") }), _jsx("p", { className: "mt-1 text-sm text-[#6B6480]", children: t("productDetail.imagesHint") })] }), _jsxs("div", { children: [_jsx("input", { ref: inputRef, type: "file", accept: "image/*", className: "hidden", onChange: handleFileChange, disabled: uploading }), _jsx("button", { type: "button", onClick: () => inputRef.current?.click(), disabled: uploading, className: "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60 sm:w-auto", children: uploading
                                    ? t("common.uploading")
                                    : t("productDetail.uploadImage") })] })] }), imageUrls.length > 0 ? (_jsx("div", { className: "mt-4", children: _jsx(ProductImageGrid, { urls: imageUrls, deletingUrl: deletingUrl, onDelete: handleDelete }) })) : (_jsx("div", { className: "mt-4 rounded-xl border border-dashed border-[#E5E3EE] bg-[#FAFAFA] px-4 py-10 text-center text-sm text-[#9D98B3]", children: t("productDetail.noImagesYet") }))] }));
}
function ProductImageGrid({ urls, deletingUrl, onDelete, compact = false, }) {
    const { t } = useI18n();
    return (_jsx("div", { className: compact
            ? "grid grid-cols-2 gap-1.5"
            : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", children: urls.map((url) => (_jsxs("div", { className: [
                "group relative aspect-square overflow-hidden border border-[#E5E3EE] bg-[#FAFAFA]",
                compact ? "rounded-lg" : "rounded-xl",
            ].join(" "), children: [_jsx("a", { href: productImageSrc(url), target: "_blank", rel: "noopener noreferrer", className: "block size-full", children: _jsx("img", { src: productImageSrc(url), alt: "", className: "size-full object-cover transition group-hover:scale-105" }) }), _jsx("button", { type: "button", onClick: (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete(url);
                    }, disabled: deletingUrl === url, title: t("productDetail.deleteImage"), "aria-label": t("productDetail.deleteImage"), className: [
                        "absolute right-1.5 top-1.5 z-10 flex items-center justify-center rounded-full bg-black/55 text-white shadow-sm transition hover:bg-red-600 disabled:opacity-60",
                        compact ? "size-6" : "size-8",
                    ].join(" "), children: deletingUrl === url ? (_jsx("span", { className: [
                            "animate-spin rounded-full border-2 border-white border-t-transparent",
                            compact ? "size-3" : "size-3.5",
                        ].join(" ") })) : (_jsx(DeleteImageIcon, { compact: compact })) })] }, url))) }));
}
function DeleteImageIcon({ compact }) {
    return (_jsx("svg", { className: compact ? "size-3" : "size-3.5", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: _jsx("path", { d: "M6 6l12 12M18 6L6 18", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round" }) }));
}
