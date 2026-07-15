import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { registerUser } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";
export function meta() {
    return [{ title: "New User | Dupli1 Admin" }];
}
const inputCls = "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";
export default function NewUser() {
    const navigate = useNavigate();
    const { notify } = useNotify();
    const { t } = useI18n();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);
        try {
            const result = await registerUser(email.trim(), password);
            notify(t("userNew.userCreated", { userId: result.user_id }));
            navigate(`/users/${encodeURIComponent(result.user_id)}`);
        }
        catch (err) {
            notify(err instanceof Error ? err.message : t("userNew.failedToCreate"), "error");
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs("div", { className: "mx-auto max-w-lg space-y-6", children: [_jsx(Link, { to: "/users", className: "text-sm text-[#6D4AFF] hover:underline", children: t("userNew.backToUsers") }), _jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-[#1C1B1F] sm:text-2xl", children: t("userNew.title") }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: t("userNew.subtitle") })] }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4 rounded-2xl border border-[#E5E3EE] bg-white p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { htmlFor: "email", className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: t("userNew.email") }), _jsx("input", { id: "email", type: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value), className: inputCls })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { htmlFor: "password", className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: t("userNew.password") }), _jsx("input", { id: "password", type: "password", required: true, minLength: 8, value: password, onChange: (e) => setPassword(e.target.value), className: inputCls })] }), _jsx("button", { type: "submit", disabled: loading, className: "w-full rounded-xl bg-[#6D4AFF] py-3 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60", children: loading ? t("userNew.creating") : t("userNew.createUser") })] })] }));
}
