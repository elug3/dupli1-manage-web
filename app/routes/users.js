import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { createUser, deleteUser, getUsers, updateUserRole, } from "~/lib/api";
export function meta() {
    return [{ title: "Users | Schick Admin" }];
}
const ROLE_ORDER = ["owner", "admin", "user"];
const ROLE_STYLES = {
    owner: "bg-violet-100 text-violet-800",
    admin: "bg-blue-100 text-blue-800",
    user: "bg-[#F4F3F8] text-[#6B6480]",
};
const inputCls = "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";
export default function Users() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [updatingId, setUpdatingId] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    useEffect(() => {
        getUsers()
            .then(setUsers)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);
    async function handleRoleChange(user, role) {
        if (role === user.role)
            return;
        setUpdatingId(user.id);
        try {
            const updated = await updateUserRole(user.id, role);
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        }
        catch {
            // silently revert
        }
        finally {
            setUpdatingId(null);
        }
    }
    async function handleDelete() {
        if (!deleteTarget)
            return;
        setDeleting(true);
        try {
            await deleteUser(deleteTarget.id);
            setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
            setDeleteTarget(null);
        }
        catch {
            // keep modal open
        }
        finally {
            setDeleting(false);
        }
    }
    function handleCreated(user) {
        setUsers((prev) => [user, ...prev]);
        setDrawerOpen(false);
    }
    const counts = ROLE_ORDER.reduce((acc, r) => ({ ...acc, [r]: users.filter((u) => u.role === r).length }), {});
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-[#1C1B1F]", children: "Users" }), _jsx("p", { className: "mt-0.5 text-sm text-[#6B6480]", children: "Manage accounts and access roles" })] }), _jsx("button", { onClick: () => setDrawerOpen(true), className: "rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5A38E8] active:scale-[0.98]", children: "+ New user" })] }), !loading && !error && (_jsx("div", { className: "grid gap-4 sm:grid-cols-3", children: ROLE_ORDER.map((role) => (_jsxs("div", { className: "flex items-center gap-4 rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: [_jsx("div", { className: `rounded-xl px-3 py-1 text-xs font-semibold capitalize ${ROLE_STYLES[role]}`, children: role }), _jsx("span", { className: "text-2xl font-bold text-[#1C1B1F]", children: counts[role] })] }, role))) })), _jsx("div", { className: "overflow-hidden rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)]", children: loading ? (_jsx("div", { className: "flex items-center justify-center py-20", children: _jsx("div", { className: "h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }) })) : error ? (_jsxs("div", { className: "flex flex-col items-center gap-2 py-20 text-center", children: [_jsx("p", { className: "font-semibold text-red-600", children: "Failed to load users" }), _jsx("p", { className: "text-sm text-[#9D98B3]", children: error })] })) : users.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center gap-3 py-20", children: [_jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-full bg-[#F4F3F8]", children: _jsx(UsersIcon, {}) }), _jsxs("div", { className: "text-center", children: [_jsx("p", { className: "font-semibold text-[#1C1B1F]", children: "No users yet" }), _jsx("p", { className: "mt-0.5 text-sm text-[#9D98B3]", children: "Create the first user to get started." })] }), _jsx("button", { onClick: () => setDrawerOpen(true), className: "mt-1 rounded-xl bg-[#6D4AFF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5A38E8]", children: "+ New user" })] })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-[#F0EEF8] bg-[#FAFAFA]", children: ["User", "Role", "Joined", "Actions"].map((h) => (_jsx("th", { className: "px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#9D98B3]", children: h }, h))) }) }), _jsx("tbody", { children: users.map((user) => (_jsxs("tr", { className: "border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]", children: [_jsx("td", { className: "px-5 py-3.5", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6D4AFF]/10 text-xs font-bold text-[#6D4AFF]", children: user.email[0].toUpperCase() }), _jsxs("div", { children: [_jsx("p", { className: "font-medium text-[#1C1B1F]", children: user.email }), _jsx("p", { className: "font-mono text-[10px] text-[#B4B0C8]", children: user.id })] })] }) }), _jsx("td", { className: "px-5 py-3.5", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(RoleBadge, { role: user.role }), _jsxs("select", { value: user.role, disabled: updatingId === user.id, onChange: (e) => handleRoleChange(user, e.target.value), className: "rounded-lg border border-[#E5E3EE] bg-white px-2 py-1 text-xs text-[#1C1B1F] outline-none focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20 disabled:opacity-50", children: [_jsx("option", { value: "user", children: "user" }), _jsx("option", { value: "admin", children: "admin" }), _jsx("option", { value: "owner", children: "owner" })] }), updatingId === user.id && (_jsx("div", { className: "h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" }))] }) }), _jsx("td", { className: "px-5 py-3.5 text-[#6B6480]", children: formatDate(user.createdAt) }), _jsx("td", { className: "px-5 py-3.5", children: _jsx("button", { onClick: () => setDeleteTarget(user), className: "rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100", children: "Delete" }) })] }, user.id))) })] }) })) }), _jsx(NewUserDrawer, { open: drawerOpen, onClose: () => setDrawerOpen(false), onCreated: handleCreated }), deleteTarget && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4", children: _jsxs("div", { className: "w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl", children: [_jsx("h3", { className: "text-lg font-bold text-[#1C1B1F]", children: "Delete user?" }), _jsxs("p", { className: "mt-2 text-sm text-[#6B6480]", children: [_jsx("span", { className: "font-semibold text-[#1C1B1F]", children: deleteTarget.email }), " ", "will be permanently removed. This cannot be undone."] }), _jsxs("div", { className: "mt-5 flex gap-3", children: [_jsx("button", { onClick: () => setDeleteTarget(null), disabled: deleting, className: "flex-1 rounded-xl border border-[#E5E3EE] bg-white py-2.5 text-sm font-semibold text-[#1C1B1F] transition hover:bg-[#F4F3F8] disabled:opacity-50", children: "Cancel" }), _jsx("button", { onClick: handleDelete, disabled: deleting, className: "flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50", children: deleting ? "Deleting…" : "Delete" })] })] }) }))] }));
}
// ── New user drawer ───────────────────────────────────────────────────────────
function NewUserDrawer({ open, onClose, onCreated, }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("user");
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [fieldError, setFieldError] = useState(null);
    const emailRef = useRef(null);
    useEffect(() => {
        if (open) {
            setEmail("");
            setPassword("");
            setRole("user");
            setShowPassword(false);
            setFieldError(null);
            setTimeout(() => emailRef.current?.focus(), 50);
        }
    }, [open]);
    async function handleSubmit(e) {
        e.preventDefault();
        setFieldError(null);
        if (password.length < 8) {
            setFieldError("Password must be at least 8 characters.");
            return;
        }
        setSaving(true);
        try {
            const user = await createUser({ email, password, role });
            onCreated(user);
        }
        catch (err) {
            setFieldError(err instanceof Error ? err.message : "Failed to create user");
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsxs(_Fragment, { children: [open && (_jsx("div", { className: "fixed inset-0 z-40 bg-black/30", onClick: onClose })), _jsxs("div", { className: [
                    "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300",
                    open ? "translate-x-0" : "translate-x-full",
                ].join(" "), children: [_jsxs("div", { className: "flex items-center justify-between border-b border-[#E5E3EE] px-6 py-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-bold text-[#1C1B1F]", children: "New user" }), _jsx("p", { className: "text-xs text-[#9D98B3]", children: "Create an admin account" })] }), _jsx("button", { onClick: onClose, className: "rounded-lg p-1.5 text-[#9D98B3] transition hover:bg-[#F4F3F8] hover:text-[#1C1B1F]", children: _jsx("svg", { className: "size-5", viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M18 6L6 18M6 6l12 12", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }) }) })] }), _jsxs("form", { onSubmit: handleSubmit, className: "flex flex-1 flex-col overflow-y-auto", children: [_jsxs("div", { className: "flex-1 space-y-5 px-6 py-6", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "block text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: "Email" }), _jsx("input", { ref: emailRef, type: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value), placeholder: "user@example.com", className: inputCls })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "block text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: "Password" }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: showPassword ? "text" : "password", required: true, value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Min. 8 characters", className: inputCls + " pr-10" }), _jsx("button", { type: "button", onClick: () => setShowPassword((v) => !v), className: "absolute inset-y-0 right-3 flex items-center text-[#9D98B3] hover:text-[#6B6480]", tabIndex: -1, children: showPassword ? _jsx(EyeOffIcon, {}) : _jsx(EyeIcon, {}) })] }), _jsx("p", { className: "text-[11px] text-[#B4B0C8]", children: "The user can change this after signing in." })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "block text-xs font-semibold uppercase tracking-wide text-[#6B6480]", children: "Role" }), _jsx("div", { className: "grid grid-cols-3 gap-2", children: ROLE_ORDER.map((r) => (_jsx("button", { type: "button", onClick: () => setRole(r), className: [
                                                        "rounded-xl border py-2.5 text-sm font-semibold capitalize transition",
                                                        role === r
                                                            ? "border-[#6D4AFF] bg-[#6D4AFF]/10 text-[#6D4AFF]"
                                                            : "border-[#E5E3EE] bg-white text-[#6B6480] hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC]",
                                                    ].join(" "), children: r }, r))) }), _jsx("p", { className: "text-[11px] text-[#B4B0C8]", children: role === "owner"
                                                    ? "Full access including super admin settings."
                                                    : role === "admin"
                                                        ? "Can manage products, orders, and users."
                                                        : "Standard customer account." })] }), fieldError && (_jsx("div", { className: "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700", children: fieldError }))] }), _jsx("div", { className: "border-t border-[#E5E3EE] px-6 py-4", children: _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { type: "button", onClick: onClose, className: "flex-1 rounded-xl border border-[#E5E3EE] bg-white py-2.5 text-sm font-semibold text-[#1C1B1F] transition hover:bg-[#F4F3F8]", children: "Cancel" }), _jsx("button", { type: "submit", disabled: saving, className: "flex-1 rounded-xl bg-[#6D4AFF] py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60", children: saving ? "Creating…" : "Create user" })] }) })] })] })] }));
}
// ── Shared components ─────────────────────────────────────────────────────────
function RoleBadge({ role }) {
    return (_jsx("span", { className: `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${ROLE_STYLES[role]}`, children: role }));
}
function formatDate(iso) {
    if (!iso)
        return "—";
    return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}
function UsersIcon() {
    return (_jsx("svg", { className: "size-6 text-[#9D98B3]", viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }) }));
}
function EyeIcon() {
    return (_jsxs("svg", { className: "size-4", viewBox: "0 0 24 24", fill: "none", children: [_jsx("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", stroke: "currentColor", strokeWidth: "1.8" }), _jsx("circle", { cx: "12", cy: "12", r: "3", stroke: "currentColor", strokeWidth: "1.8" })] }));
}
function EyeOffIcon() {
    return (_jsx("svg", { className: "size-4", viewBox: "0 0 24 24", fill: "none", children: _jsx("path", { d: "M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }) }));
}
