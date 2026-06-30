import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate } from "react-router";
import { login } from "~/lib/auth";
export function meta() {
    return [{ title: "Sign in | Schick Admin" }];
}
export default function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await login(email, password);
            navigate("/", { replace: true });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsx("div", { className: "flex min-h-dvh flex-col items-center justify-center bg-[#F4F3F8] px-4 py-8", children: _jsxs("div", { className: "w-full max-w-sm", children: [_jsxs("div", { className: "mb-8 flex flex-col items-center", children: [_jsx("div", { className: "mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6D4AFF]", children: _jsx("svg", { className: "size-6 text-white", viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M4 7h16M4 12h10M4 17h7", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }) }) }), _jsx("h1", { className: "text-xl font-bold tracking-tight text-[#1C1B1F]", children: "Schick Admin" }), _jsx("p", { className: "mt-1 text-sm text-[#6B6480]", children: "Sign in to your admin account" })] }), _jsx("form", { onSubmit: handleSubmit, className: "rounded-2xl border border-[#E5E3EE] bg-white p-7 shadow-[0_2px_12px_rgba(28,27,31,0.06)]", children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { htmlFor: "email", className: "block text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: "Email" }), _jsx("input", { id: "email", type: "email", required: true, autoComplete: "email", autoFocus: true, value: email, onChange: (e) => setEmail(e.target.value), className: "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-3 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20", placeholder: "admin@example.com" })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { htmlFor: "password", className: "block text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: "Password" }), _jsx("input", { id: "password", type: "password", required: true, autoComplete: "current-password", value: password, onChange: (e) => setPassword(e.target.value), className: "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-3 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" })] }), error && (_jsxs("div", { className: "flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600", children: [_jsx("svg", { className: "size-4 shrink-0", viewBox: "0 0 20 20", fill: "currentColor", children: _jsx("path", { fillRule: "evenodd", d: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z", clipRule: "evenodd" }) }), error] })), _jsx("button", { type: "submit", disabled: loading, className: "w-full rounded-xl bg-[#6D4AFF] py-3 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60 active:scale-[0.98]", children: loading ? "Signing in…" : "Sign in" })] }) }), _jsx("p", { className: "mt-6 text-center text-xs text-[#9D98B3]", children: "Schick Management Console \u00B7 Admin access only" })] }) }));
}
