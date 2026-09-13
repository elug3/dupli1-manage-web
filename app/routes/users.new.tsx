import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { registerUser } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "New User | Dupli1 Admin" }];
}

const inputCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function NewUser() {
  const navigate = useNavigate();
  const { notify } = useNotify();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await registerUser(email.trim(), password);
      notify(t("userNew.userCreated", { userId: result.user_id }));
      navigate(`/users/${encodeURIComponent(result.user_id)}`);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("userNew.failedToCreate"),
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link to="/users" className="text-sm text-accent hover:underline">
        {t("userNew.backToUsers")}
      </Link>

      <div>
        <h1 className="text-xl font-bold text-ink sm:text-2xl">
          {t("userNew.title")}
        </h1>
        <p className="mt-0.5 text-sm text-muted">{t("userNew.subtitle")}</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-edge bg-surface p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            {t("userNew.email")}
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
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            {t("userNew.password")}
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
          className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
        >
          {loading ? t("userNew.creating") : t("userNew.createUser")}
        </button>
      </form>
    </div>
  );
}
