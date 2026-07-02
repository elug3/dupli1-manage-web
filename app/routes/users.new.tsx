import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { registerUser } from "~/lib/api";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "New User | Dupli1 Admin" }];
}

const inputCls =
  "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";

export default function NewUser() {
  const navigate = useNavigate();
  const { notify } = useNotify();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await registerUser(email.trim(), password);
      notify(`User created: ${result.user_id}`);
      navigate(`/users/${encodeURIComponent(result.user_id)}`);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Failed to create user",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link to="/users" className="text-sm text-[#6D4AFF] hover:underline">
        ← Back to users
      </Link>

      <div>
        <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">New user</h1>
        <p className="mt-0.5 text-sm text-[#6B6480]">
          Create an account via{" "}
          <code className="text-xs">POST /auth/api/v1/auth/register</code> using
          your signed-in admin credentials. Assign roles on the user detail page
          after creation.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-[#E5E3EE] bg-white p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[#6D4AFF] py-3 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60"
        >
          {loading ? "Creating…" : "Create user"}
        </button>
      </form>
    </div>
  );
}
