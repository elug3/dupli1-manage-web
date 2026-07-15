import { useState } from "react";
import { useNavigate } from "react-router";
import { login } from "~/lib/auth";
import { useI18n } from "~/lib/i18n";
import { LanguageSwitcher } from "~/lib/i18n/LanguageSwitcher";
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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#F4F3F8] px-4 py-8">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <LanguageSwitcher compact />
      </div>
      <div className="w-full max-w-sm">
        {/* Logo mark */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6D4AFF]">
            <svg className="size-6 text-white" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h16M4 12h10M4 17h7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#1C1B1F]">
            {t("login.heading")}
          </h1>
          <p className="mt-1 text-sm text-[#6B6480]">{t("login.subtitle")}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[#E5E3EE] bg-white p-7 shadow-[0_2px_12px_rgba(28,27,31,0.06)]"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wide text-[#6B6480]"
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
                className="w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-3 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20"
                placeholder={t("login.emailPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wide text-[#6B6480]"
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
                className="w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-3 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20"
                placeholder={t("login.passwordPlaceholder")}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#6D4AFF] py-3 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60 active:scale-[0.98]"
            >
              {loading ? t("login.signingIn") : t("login.signIn")}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-[#9D98B3]">
          {t("login.footer")}
        </p>
      </div>
    </div>
  );
}
