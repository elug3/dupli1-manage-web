import { useState } from "react";
import { useNavigate } from "react-router";
import { login } from "~/lib/auth";
import { useI18n } from "~/lib/i18n";
import { LanguageSwitcher } from "~/lib/i18n/LanguageSwitcher";
import { ThemeSwitcher } from "~/lib/ThemeSwitcher";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "Sign in | Dupli1 Admin" }];
}

export default function Login() {
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
      const user = await login(email, password);
      navigate("/", { replace: true, state: { user } });
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("common.somethingWentWrong"),
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-page px-4 py-8">
      <div className="absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6">
        <ThemeSwitcher compact />
        <LanguageSwitcher compact />
      </div>
      <div className="w-full max-w-sm">
        {/* Logo mark */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent">
            <svg className="size-6 text-white" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h16M4 12h10M4 17h7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            {t("login.heading")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("login.subtitle")}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-edge bg-surface p-7 shadow-[0_2px_12px_rgba(28,27,31,0.06)]"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wide text-muted"
              >
                {t("login.email")}
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-edge bg-panel px-4 py-3 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder={t("login.emailPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wide text-muted"
              >
                {t("login.password")}
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-edge bg-panel px-4 py-3 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder={t("login.passwordPlaceholder")}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60 active:scale-[0.98]"
            >
              {loading ? t("login.signingIn") : t("login.signIn")}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-faint">
          {t("login.footer")}
        </p>
      </div>
    </div>
  );
}
