import { useEffect, useRef, useState } from "react";
import {
  type AdminUser,
  type UserRole,
  createUser,
  deleteUser,
  getUsers,
  updateUserRole,
} from "~/lib/api";

export function meta() {
  return [{ title: "Users | Schick Admin" }];
}

const ROLE_ORDER: UserRole[] = ["owner", "admin", "user"];

const ROLE_STYLES: Record<UserRole, string> = {
  owner: "bg-violet-100 text-violet-800",
  admin: "bg-blue-100 text-blue-800",
  user: "bg-[#F4F3F8] text-[#6B6480]",
};

const inputCls =
  "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";

export default function Users() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleRoleChange(user: AdminUser, role: UserRole) {
    if (role === user.role) return;
    setUpdatingId(user.id);
    try {
      const updated = await updateUserRole(user.id, role);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch {
      // silently revert
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      // keep modal open
    } finally {
      setDeleting(false);
    }
  }

  function handleCreated(user: AdminUser) {
    setUsers((prev) => [user, ...prev]);
    setDrawerOpen(false);
  }

  const counts = ROLE_ORDER.reduce(
    (acc, r) => ({ ...acc, [r]: users.filter((u) => u.role === r).length }),
    {} as Record<UserRole, number>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1C1B1F]">Users</h1>
          <p className="mt-0.5 text-sm text-[#6B6480]">
            Manage accounts and access roles
          </p>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          className="rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5A38E8] active:scale-[0.98]"
        >
          + New user
        </button>
      </div>

      {/* Summary cards */}
      {!loading && !error && (
        <div className="grid gap-4 sm:grid-cols-3">
          {ROLE_ORDER.map((role) => (
            <div
              key={role}
              className="flex items-center gap-4 rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]"
            >
              <div
                className={`rounded-xl px-3 py-1 text-xs font-semibold capitalize ${ROLE_STYLES[role]}`}
              >
                {role}
              </div>
              <span className="text-2xl font-bold text-[#1C1B1F]">
                {counts[role]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[#E5E3EE] bg-white shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-20 text-center">
            <p className="font-semibold text-red-600">Failed to load users</p>
            <p className="text-sm text-[#9D98B3]">{error}</p>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F4F3F8]">
              <UsersIcon />
            </div>
            <div className="text-center">
              <p className="font-semibold text-[#1C1B1F]">No users yet</p>
              <p className="mt-0.5 text-sm text-[#9D98B3]">
                Create the first user to get started.
              </p>
            </div>
            <button
              onClick={() => setDrawerOpen(true)}
              className="mt-1 rounded-xl bg-[#6D4AFF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5A38E8]"
            >
              + New user
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F0EEF8] bg-[#FAFAFA]">
                  {["User", "Role", "Joined", "Actions"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#9D98B3]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-[#F0EEF8] last:border-0 hover:bg-[#FAFAFA]"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6D4AFF]/10 text-xs font-bold text-[#6D4AFF]">
                          {user.email[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-[#1C1B1F]">
                            {user.email}
                          </p>
                          <p className="font-mono text-[10px] text-[#B4B0C8]">
                            {user.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <RoleBadge role={user.role} />
                        <select
                          value={user.role}
                          disabled={updatingId === user.id}
                          onChange={(e) =>
                            handleRoleChange(user, e.target.value as UserRole)
                          }
                          className="rounded-lg border border-[#E5E3EE] bg-white px-2 py-1 text-xs text-[#1C1B1F] outline-none focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20 disabled:opacity-50"
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                          <option value="owner">owner</option>
                        </select>
                        {updatingId === user.id && (
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-[#6B6480]">
                      {formatDate(user.createdAt)}
                    </td>

                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => setDeleteTarget(user)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New user drawer */}
      <NewUserDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={handleCreated}
      />

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#1C1B1F]">Delete user?</h3>
            <p className="mt-2 text-sm text-[#6B6480]">
              <span className="font-semibold text-[#1C1B1F]">
                {deleteTarget.email}
              </span>{" "}
              will be permanently removed. This cannot be undone.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-[#E5E3EE] bg-white py-2.5 text-sm font-semibold text-[#1C1B1F] transition hover:bg-[#F4F3F8] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── New user drawer ───────────────────────────────────────────────────────────

function NewUserDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (user: AdminUser) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

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

  async function handleSubmit(e: React.FormEvent) {
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
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
        />
      )}

      {/* Slide-over panel */}
      <div
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5E3EE] px-6 py-4">
          <div>
            <h2 className="font-bold text-[#1C1B1F]">New user</h2>
            <p className="text-xs text-[#9D98B3]">Create an admin account</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#9D98B3] transition hover:bg-[#F4F3F8] hover:text-[#1C1B1F]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex-1 space-y-5 px-6 py-6">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
                Email
              </label>
              <input
                ref={emailRef}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className={inputCls}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className={inputCls + " pr-10"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-[#9D98B3] hover:text-[#6B6480]"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              <p className="text-[11px] text-[#B4B0C8]">
                The user can change this after signing in.
              </p>
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
                Role
              </label>
              <div className="grid grid-cols-3 gap-2">
                {ROLE_ORDER.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={[
                      "rounded-xl border py-2.5 text-sm font-semibold capitalize transition",
                      role === r
                        ? "border-[#6D4AFF] bg-[#6D4AFF]/10 text-[#6D4AFF]"
                        : "border-[#E5E3EE] bg-white text-[#6B6480] hover:border-[#6D4AFF]/40 hover:bg-[#F8F7FC]",
                    ].join(" ")}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#B4B0C8]">
                {role === "owner"
                  ? "Full access including super admin settings."
                  : role === "admin"
                  ? "Can manage products, orders, and users."
                  : "Standard customer account."}
              </p>
            </div>

            {/* Error */}
            {fieldError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {fieldError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[#E5E3EE] px-6 py-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-[#E5E3EE] bg-white py-2.5 text-sm font-semibold text-[#1C1B1F] transition hover:bg-[#F4F3F8]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-[#6D4AFF] py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60"
              >
                {saving ? "Creating…" : "Create user"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${ROLE_STYLES[role]}`}
    >
      {role}
    </span>
  );
}

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function UsersIcon() {
  return (
    <svg className="size-6 text-[#9D98B3]" viewBox="0 0 24 24" fill="none">
      <path
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
