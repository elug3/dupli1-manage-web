import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { createCoupon, deleteCoupon, getCoupons, updateCoupon, } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";
export function meta() {
    return [{ title: "Coupons | Dupli1 Admin" }];
}
const inputCls = "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";
export default function Coupons() {
    const { notify } = useNotify();
    const { t } = useI18n();
    const [coupons, setCoupons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [code, setCode] = useState("");
    const [discountPct, setDiscountPct] = useState("");
    const [description, setDescription] = useState("");
    const [expires, setExpires] = useState("");
    const [creating, setCreating] = useState(false);
    const [busyCode, setBusyCode] = useState(null);
    function loadCoupons() {
        setLoading(true);
        setError(null);
        getCoupons()
            .then(setCoupons)
            .catch((err) => {
            setCoupons([]);
            setError(err instanceof Error ? err.message : t("coupons.failedToLoad"));
        })
            .finally(() => setLoading(false));
    }
    useEffect(() => {
        loadCoupons();
    }, []);
    async function handleCreate(e) {
        e.preventDefault();
        const discount = Number(discountPct) / 100;
        if (!code.trim() || Number.isNaN(discount) || discount <= 0 || discount > 1) {
            notify(t("coupons.invalidCodeOrDiscount"), "error");
            return;
        }
        setCreating(true);
        try {
            const created = await createCoupon({
                code: code.trim(),
                discount,
                description: description.trim() || undefined,
                expires: expires.trim() || undefined,
                active: true,
            });
            setCoupons((prev) => [...prev, created]);
            setCode("");
            setDiscountPct("");
            setDescription("");
            setExpires("");
            notify(t("coupons.couponCreated", { code: created.code }));
        }
        catch (err) {
            notify(err instanceof Error ? err.message : t("coupons.failedToCreate"), "error");
        }
        finally {
            setCreating(false);
        }
    }
    async function handleToggleActive(coupon) {
        setBusyCode(coupon.code);
        try {
            const updated = await updateCoupon(coupon.code, {
                active: !coupon.active,
            });
            setCoupons((prev) => prev.map((c) => (c.code === coupon.code ? updated : c)));
        }
        catch (err) {
            notify(err instanceof Error ? err.message : t("coupons.failedToUpdate"), "error");
        }
        finally {
            setBusyCode(null);
        }
    }
    async function handleDelete(couponCode) {
        setBusyCode(couponCode);
        try {
            await deleteCoupon(couponCode);
            setCoupons((prev) => prev.filter((c) => c.code !== couponCode));
            notify(t("coupons.couponDeleted", { code: couponCode }));
        }
        catch (err) {
            notify(err instanceof Error ? err.message : t("coupons.failedToDelete"), "error");
        }
        finally {
            setBusyCode(null);
        }
    }
    const headers = [
        t("coupons.colCode"),
        t("coupons.colDiscount"),
        t("coupons.colDescription"),
        t("coupons.colExpires"),
        t("coupons.colActive"),
        "",
    ];
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-[#1C1B1F] sm:text-2xl", children: t("coupons.title") }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: t("coupons.subtitle") })] }), _jsxs("form", { onSubmit: handleCreate, className: "grid gap-4 rounded-2xl border border-[#E5E3EE] bg-white p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:grid-cols-2", children: [_jsx(Field, { label: t("coupons.code"), id: "code", required: true, children: _jsx("input", { id: "code", value: code, onChange: (e) => setCode(e.target.value.toUpperCase()), className: inputCls, placeholder: t("coupons.codePlaceholder"), required: true }) }), _jsx(Field, { label: t("coupons.discountPercent"), id: "discount", required: true, children: _jsx("input", { id: "discount", type: "number", min: "1", max: "100", step: "1", value: discountPct, onChange: (e) => setDiscountPct(e.target.value), className: inputCls, placeholder: t("coupons.discountPlaceholder"), required: true }) }), _jsx(Field, { label: t("coupons.description"), id: "description", children: _jsx("input", { id: "description", value: description, onChange: (e) => setDescription(e.target.value), className: inputCls, placeholder: t("coupons.descriptionPlaceholder") }) }), _jsx(Field, { label: t("coupons.expires"), id: "expires", children: _jsx("input", { id: "expires", value: expires, onChange: (e) => setExpires(e.target.value), className: inputCls, placeholder: t("coupons.expiresPlaceholder") }) }), _jsx("div", { className: "sm:col-span-2", children: _jsx("button", { type: "submit", disabled: creating, className: "rounded-xl bg-[#6D4AFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60", children: creating ? t("coupons.creating") : t("coupons.createCoupon") }) })] }), error && (_jsx("div", { className: "rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600", children: error })), _jsx("div", { className: "rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)] overflow-hidden", children: loading ? (_jsx("div", { className: "flex items-center justify-center py-20", children: _jsx("div", { className: "h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }) })) : coupons.length === 0 ? (_jsx("div", { className: "px-5 py-16 text-center text-[#9D98B3]", children: t("coupons.noCouponsYet") })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#F0EEF8] bg-[#FAFAFA] text-left", children: headers.map((h, i) => (_jsx("th", { className: "px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: h }, h || `actions-${i}`))) }) }), _jsx("tbody", { children: coupons.map((coupon) => (_jsxs("tr", { className: "border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]", children: [_jsx("td", { className: "px-5 py-3.5 font-mono font-semibold text-[#1C1B1F]", children: coupon.code }), _jsxs("td", { className: "px-5 py-3.5 text-[#6B6480]", children: [Math.round(coupon.discount * 100), "%"] }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: coupon.description || t("common.emptyValue") }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: coupon.expires || t("common.emptyValue") }), _jsx("td", { className: "px-5 py-3.5", children: _jsx("button", { type: "button", disabled: busyCode === coupon.code, onClick: () => handleToggleActive(coupon), className: [
                                                    "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                                                    coupon.active
                                                        ? "bg-emerald-50 text-emerald-700"
                                                        : "bg-[#F4F3F8] text-[#9D98B3]",
                                                ].join(" "), children: coupon.active
                                                    ? t("coupons.active")
                                                    : t("coupons.inactive") }) }), _jsx("td", { className: "px-5 py-3.5 text-right", children: _jsx("button", { type: "button", disabled: busyCode === coupon.code, onClick: () => handleDelete(coupon.code), className: "text-xs font-semibold text-red-600 hover:underline disabled:opacity-50", children: t("coupons.delete") }) })] }, coupon.code))) })] }) })) })] }));
}
function Field({ label, id, required, children, }) {
    return (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("label", { htmlFor: id, className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: [label, required && _jsx("span", { className: "text-red-500", children: " *" })] }), children] }));
}
