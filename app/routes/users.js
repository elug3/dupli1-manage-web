import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { registerUser } from "~/lib/api";
export function meta() {
    return [{ title: "Users | Schick Admin" }];
}
const inputCls = "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";
export default function Users() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [createdId, setCreatedId] = useState(null);
    async function handleSubmit(e) {
        e.preventDefault();
        setError(null);
        setCreatedId(null);
        setLoading(true);
        try {
            const result = await registerUser(email, password);
            setCreatedId(result.user_id);
            setEmail("");
            setPassword("");
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Registration failed");
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs("div", { className: "mx-auto max-w-lg space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-[#1C1B1F] sm:text-2xl", children: "Register user" }), _jsxs("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: ["Create accounts via ", _jsx("code", { className: "text-xs", children: "POST /auth/api/v1/auth/register" })] })] }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4 rounded-2xl border border-[#E5E3EE] bg-white p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { htmlFor: "email", className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: "Email" }), _jsx("input", { id: "email", type: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value), className: inputCls })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { htmlFor: "password", className: "text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: "Password" }), _jsx("input", { id: "password", type: "password", required: true, minLength: 8, value: password, onChange: (e) => setPassword(e.target.value), className: inputCls })] }), error && (_jsx("div", { className: "rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600", children: error })), createdId && (_jsxs("div", { className: "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700", children: ["User created: ", _jsx("span", { className: "font-mono", children: createdId })] })), _jsx("button", { type: "submit", disabled: loading, className: "w-full rounded-xl bg-[#6D4AFF] py-3 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60", children: loading ? "Creating…" : "Register user" })] })] }));
}
