import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { createProductParent, createStyle, createVariant, listBrands, listColors, listEditions, listSizes, listStyles, setInventory, uploadProductImage, uploadVariantImage, } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";
export function meta() {
    return [{ title: "New Product | Dupli1 Admin" }];
}
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const inputCls = "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";
export default function NewProduct() {
    const navigate = useNavigate();
    const { notify } = useNotify();
    const { t } = useI18n();
    const imageInputRef = useRef(null);
    const [brands, setBrands] = useState([]);
    const [styles, setStyles] = useState([]);
    const [colors, setColors] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [editions, setEditions] = useState([]);
    const [mastersLoading, setMastersLoading] = useState(true);
    const [name, setName] = useState("");
    const [brandCode, setBrandCode] = useState("");
    const [styleCode, setStyleCode] = useState("");
    const [newStyleCode, setNewStyleCode] = useState("");
    const [newStyleName, setNewStyleName] = useState("");
    const [creatingStyle, setCreatingStyle] = useState(false);
    const [material, setMaterial] = useState("");
    const [description, setDescription] = useState("");
    const [colorCode, setColorCode] = useState("");
    const [sizeCode, setSizeCode] = useState("OS");
    const [editionCode, setEditionCode] = useState("");
    const [price, setPrice] = useState("");
    const [status, setStatus] = useState("active");
    const [initialStock, setInitialStock] = useState("");
    const [imageFile, setImageFile] = useState(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        let cancelled = false;
        Promise.all([listBrands(), listColors(), listSizes(), listEditions()])
            .then(([b, c, s, e]) => {
            if (cancelled)
                return;
            setBrands(b);
            setColors(c);
            setSizes(s);
            setEditions(e);
            if (b[0])
                setBrandCode(b[0].code);
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
                setMastersLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [notify, t]);
    useEffect(() => {
        if (!brandCode) {
            setStyles([]);
            setStyleCode("");
            return;
        }
        let cancelled = false;
        listStyles(brandCode)
            .then((rows) => {
            if (cancelled)
                return;
            setStyles(rows);
            setStyleCode((prev) => rows.some((r) => r.code === prev) ? prev : rows[0]?.code ?? "");
        })
            .catch((err) => {
            if (!cancelled) {
                notify(err instanceof Error ? err.message : t("productNew.failedToLoadStyles"), "error");
                setStyles([]);
                setStyleCode("");
            }
        });
        return () => {
            cancelled = true;
        };
    }, [brandCode, notify, t]);
    useEffect(() => {
        if (!imageFile) {
            setImagePreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(imageFile);
        setImagePreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [imageFile]);
    function clearImage() {
        setImageFile(null);
        if (imageInputRef.current)
            imageInputRef.current.value = "";
    }
    function handleImageChange(e) {
        const file = e.target.files?.[0];
        if (!file) {
            setImageFile(null);
            return;
        }
        if (!file.type.startsWith("image/")) {
            notify(t("common.pleaseChooseImageFile"), "error");
            e.target.value = "";
            setImageFile(null);
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            notify(t("common.imageMustBe50MiBOrSmaller"), "error");
            e.target.value = "";
            setImageFile(null);
            return;
        }
        setImageFile(file);
    }
    async function applyInitialStock(variantSku) {
        const stockQty = Number.parseInt(initialStock, 10);
        if (!Number.isNaN(stockQty) && stockQty >= 0 && variantSku) {
            await setInventory(variantSku, stockQty).catch(() => { });
        }
    }
    async function uploadSelectedImage(opts) {
        if (!imageFile)
            return true;
        try {
            if (opts.variantSku) {
                await uploadVariantImage(opts.productId, opts.variantSku, imageFile);
            }
            else {
                await uploadProductImage(opts.productId, imageFile);
            }
            return true;
        }
        catch (err) {
            notify(t("productNew.productCreatedButImageFailed", {
                error: err instanceof Error ? err.message : t("productNew.unknownError"),
            }), "error");
            return false;
        }
    }
    async function handleCreateStyle(e) {
        e.preventDefault();
        if (!brandCode)
            return;
        const code = newStyleCode.trim().toUpperCase();
        const styleName = newStyleName.trim() || name.trim();
        if (!code || !styleName) {
            notify(t("productNew.styleCodeAndNameRequired"), "error");
            return;
        }
        setCreatingStyle(true);
        try {
            const created = await createStyle(brandCode, code, styleName);
            const rows = await listStyles(brandCode);
            setStyles(rows);
            setStyleCode(created.code);
            setNewStyleCode("");
            setNewStyleName("");
            notify(t("productNew.styleCreated", { code: created.code }));
        }
        catch (err) {
            notify(err instanceof Error ? err.message : t("productNew.failedToCreateStyle"), "error");
        }
        finally {
            setCreatingStyle(false);
        }
    }
    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);
        try {
            if (!brandCode || !styleCode) {
                throw new Error(t("productNew.selectBrandAndStyle"));
            }
            if (!colorCode || !sizeCode) {
                throw new Error(t("productNew.selectColorAndSize"));
            }
            const parsedPrice = Number.parseFloat(price);
            if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
                throw new Error(t("productNew.enterValidPriceForFirstVariant"));
            }
            const brandName = brands.find((b) => b.code === brandCode)?.name;
            const colorName = colors.find((c) => c.code === colorCode)?.name;
            const sizeName = sizes.find((s) => s.code === sizeCode)?.name;
            const parent = await createProductParent({
                name: name.trim(),
                brandCode,
                styleCode,
                brand: brandName,
                material: material.trim(),
                description: description.trim() || undefined,
                status,
            });
            let createdVariantSku;
            try {
                const variant = await createVariant(parent.id, {
                    colorCode,
                    sizeCode,
                    editionCode: editionCode || undefined,
                    color: colorName,
                    size: sizeName,
                    price: parsedPrice,
                    status,
                });
                createdVariantSku = variant.sku;
                await applyInitialStock(variant.sku);
            }
            catch (err) {
                notify(t("productNew.styleCreatedButVariantFailed", {
                    name: name.trim(),
                    error: err instanceof Error ? err.message : t("productNew.unknownError"),
                }), "error");
                navigate(`/products/${encodeURIComponent(parent.id)}`);
                return;
            }
            const uploaded = await uploadSelectedImage({
                productId: parent.id,
                variantSku: createdVariantSku,
            });
            if (uploaded)
                notify(t("productNew.productCreated", { name: name.trim() }));
            navigate(`/products/${encodeURIComponent(parent.id)}`);
        }
        catch (err) {
            notify(friendlyCreateError(err, t), "error");
        }
        finally {
            setLoading(false);
        }
    }
    if (mastersLoading) {
        return (_jsx("div", { className: "flex items-center justify-center py-32", children: _jsx("div", { className: "h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }) }));
    }
    return (_jsxs("div", { className: "mx-auto max-w-lg space-y-6", children: [_jsx(Link, { to: "/products", className: "text-sm text-[#6D4AFF] hover:underline", children: t("productNew.backToProducts") }), _jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-[#1C1B1F] sm:text-2xl", children: t("productNew.title") }), _jsxs("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: [t("productNew.subtitlePrefix"), " ", _jsx(Link, { to: "/catalog", className: "text-[#6D4AFF] hover:underline", children: t("productNew.subtitleCatalogLink") }), "."] })] }), brands.length === 0 && (_jsx("div", { className: "rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900", children: t("productNew.noBrandsWarning") })), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-6 rounded-2xl border border-[#E5E3EE] bg-white p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsxs("section", { className: "space-y-4", children: [_jsx("h2", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("productNew.sectionStyleParent") }), _jsx(Field, { label: t("productNew.name"), id: "name", required: true, children: _jsx("input", { id: "name", type: "text", required: true, value: name, onChange: (e) => setName(e.target.value), className: inputCls, placeholder: t("productNew.namePlaceholder") }) }), _jsx(Field, { label: t("productNew.brandCode"), id: "brandCode", required: true, children: _jsx("select", { id: "brandCode", required: true, value: brandCode, onChange: (e) => setBrandCode(e.target.value), className: inputCls, disabled: brands.length === 0, children: brands.length === 0 ? (_jsx("option", { value: "", children: t("productNew.noBrandsOption") })) : (brands.map((b) => (_jsxs("option", { value: b.code, children: [b.code, " \u2014 ", b.name] }, b.code)))) }) }), _jsx(Field, { label: t("productNew.styleCode"), id: "styleCode", required: true, children: _jsx("select", { id: "styleCode", required: true, value: styleCode, onChange: (e) => setStyleCode(e.target.value), className: inputCls, disabled: styles.length === 0, children: styles.length === 0 ? (_jsx("option", { value: "", children: t("productNew.createStyleBelowOption") })) : (styles.map((s) => (_jsxs("option", { value: s.code, children: [s.code, " \u2014 ", s.name] }, s.code)))) }) }), _jsxs("div", { className: "rounded-xl border border-dashed border-[#E5E3EE] bg-[#FAFAFA] p-4 space-y-3", children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("productNew.orCreateStyleUnder", {
                                            brand: brandCode || "brand",
                                        }) }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [_jsx("input", { value: newStyleCode, onChange: (e) => setNewStyleCode(e.target.value.toUpperCase()), className: inputCls, placeholder: t("productNew.newStyleCodePlaceholder"), disabled: !brandCode || creatingStyle }), _jsx("input", { value: newStyleName, onChange: (e) => setNewStyleName(e.target.value), className: inputCls, placeholder: name.trim() || t("productNew.newStyleNamePlaceholder"), disabled: !brandCode || creatingStyle })] }), _jsx("button", { type: "button", onClick: handleCreateStyle, disabled: !brandCode || creatingStyle, className: "rounded-xl border border-[#E5E3EE] px-3 py-2 text-xs font-semibold text-[#6D4AFF] hover:border-[#6D4AFF]/40 disabled:opacity-60", children: creatingStyle ? t("common.creating") : t("productNew.createStyle") })] }), _jsx(Field, { label: t("productNew.material"), id: "material", required: true, children: _jsx("input", { id: "material", type: "text", required: true, value: material, onChange: (e) => setMaterial(e.target.value), className: inputCls }) }), _jsx(Field, { label: t("productNew.description"), id: "description", children: _jsx("textarea", { id: "description", value: description, onChange: (e) => setDescription(e.target.value), rows: 3, className: inputCls, placeholder: t("common.optional") }) })] }), _jsxs("section", { className: "space-y-4 border-t border-[#F0EEF8] pt-6", children: [_jsx("h2", { className: "text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: t("productNew.sectionFirstVariant") }), _jsx(Field, { label: t("productNew.colorCode"), id: "colorCode", required: true, children: _jsx("select", { id: "colorCode", required: true, value: colorCode, onChange: (e) => setColorCode(e.target.value), className: inputCls, children: colors.map((c) => (_jsxs("option", { value: c.code, children: [c.code, " \u2014 ", c.name] }, c.code))) }) }), _jsx(Field, { label: t("productNew.sizeCode"), id: "sizeCode", required: true, children: _jsx("select", { id: "sizeCode", required: true, value: sizeCode, onChange: (e) => setSizeCode(e.target.value), className: inputCls, children: sizes.map((s) => (_jsxs("option", { value: s.code, children: [s.code, " \u2014 ", s.name] }, s.code))) }) }), _jsx(Field, { label: t("productNew.editionCode"), id: "editionCode", children: _jsxs("select", { id: "editionCode", value: editionCode, onChange: (e) => setEditionCode(e.target.value), className: inputCls, children: [_jsx("option", { value: "", children: t("common.none") }), editions.map((ed) => (_jsxs("option", { value: ed.code, children: [ed.code, " \u2014 ", ed.name] }, ed.code)))] }) }), _jsx(Field, { label: t("productNew.priceKrw"), id: "price", required: true, children: _jsx("input", { id: "price", type: "number", required: true, min: 0, step: "1", value: price, onChange: (e) => setPrice(e.target.value), className: inputCls, placeholder: t("productNew.pricePlaceholder") }) }), _jsx(Field, { label: t("productNew.status"), id: "status", children: _jsxs("select", { id: "status", value: status, onChange: (e) => setStatus(e.target.value), className: inputCls, children: [_jsx("option", { value: "active", children: t("common.statusActive") }), _jsx("option", { value: "draft", children: t("common.statusDraft") }), _jsx("option", { value: "archived", children: t("common.statusArchived") })] }) }), _jsx(Field, { label: t("productNew.initialStock"), id: "stock", children: _jsx("input", { id: "stock", type: "number", min: 0, value: initialStock, onChange: (e) => setInitialStock(e.target.value), className: inputCls, placeholder: t("productNew.initialStockPlaceholder") }) }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: t("productNew.image") }), _jsx("p", { className: "text-sm text-[#6B6480]", children: t("productNew.imageHint") }), _jsx("input", { ref: imageInputRef, id: "image", type: "file", accept: "image/*", className: "hidden", onChange: handleImageChange, disabled: loading }), imageFile && imagePreviewUrl ? (_jsxs("div", { className: "flex items-start gap-3 rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] p-3", children: [_jsx("img", { src: imagePreviewUrl, alt: "", className: "h-20 w-20 shrink-0 rounded-lg object-cover" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium text-[#1C1B1F]", children: imageFile.name }), _jsxs("p", { className: "mt-0.5 text-xs text-[#9D98B3]", children: [(imageFile.size / 1024).toFixed(1), " KB"] }), _jsxs("div", { className: "mt-2 flex flex-wrap gap-3", children: [_jsx("button", { type: "button", onClick: () => imageInputRef.current?.click(), disabled: loading, className: "text-xs font-semibold text-[#6D4AFF] hover:underline disabled:opacity-60", children: t("common.replace") }), _jsx("button", { type: "button", onClick: clearImage, disabled: loading, className: "text-xs font-semibold text-[#9D98B3] hover:underline disabled:opacity-60", children: t("common.remove") })] })] })] })) : (_jsx("button", { type: "button", onClick: () => imageInputRef.current?.click(), disabled: loading, className: "inline-flex w-full items-center justify-center rounded-xl border border-dashed border-[#E5E3EE] bg-[#FAFAFA] px-4 py-8 text-sm font-semibold text-[#6D4AFF] transition hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC] disabled:opacity-60", children: t("productNew.chooseImage") }))] })] }), _jsx("button", { type: "submit", disabled: loading || brands.length === 0 || !styleCode, className: "w-full rounded-xl bg-[#6D4AFF] py-3 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60", children: loading
                            ? imageFile
                                ? t("productNew.creatingAndUploading")
                                : t("common.creating")
                            : t("productNew.createProduct") })] })] }));
}
function friendlyCreateError(err, t) {
    const message = err instanceof Error ? err.message : "";
    if (/master not found|not found/i.test(message)) {
        return t("productNew.masterMissing");
    }
    if (/brandCode and styleCode|colorCode|sizeCode|missing/i.test(message)) {
        return message;
    }
    if (/duplicate key|23505|already exists/i.test(message)) {
        return t("productNew.duplicateExists");
    }
    return message || t("productNew.failedToCreateProduct");
}
function Field({ label, id, required, children, }) {
    return (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("label", { htmlFor: id, className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: [label, required && _jsx("span", { className: "text-red-500", children: " *" })] }), children] }));
}
