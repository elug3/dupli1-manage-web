import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { type AccountType, registerUser } from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "New User | Dupli1 Admin" }];
}

const ACCOUNT_TYPES: AccountType[] = ["customer", "manager", "service"];

const inputCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";

function initialAccountType(value: string | null): AccountType {
  return value === "manager" || value === "service" ? value : "customer";
}

export default function NewUser() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { notify } = useNotify();
  const { t } = useI18n();
  const [accountType, setAccountType] = useState<AccountType>(() =>
    initialAccountType(searchParams.get("type"))
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Service accounts have no password: they authenticate with API keys,
  // minted on the detail page once the account exists.
  const isService = accountType === "service";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await registerUser(
        email.trim(),
        accountType,
        isService ? undefined : password
      );
      notify(t("userNew.userCreated", { userId: result.user_id }));
      const detail = `/users/${encodeURIComponent(result.user_id)}`;
      navigate(isService ? `${detail}?tab=credentials` : detail);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("userNew.failedToCreate"),
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  const accountTypeLabels: Record<AccountType, string> = {
    customer: t("userDetail.accountTypeCustomer"),
    manager: t("userDetail.accountTypeManager"),
    service: t("userDetail.accountTypeService"),
  };

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
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("userNew.accountType")}
          </legend>
          <div className="flex flex-wrap gap-2 pt-1.5">
            {ACCOUNT_TYPES.map((type) => (
              <label
                key={type}
                className={[
                  "cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition",
                  accountType === type
                    ? "bg-accent text-white"
                    : "border border-edge bg-surface text-muted hover:border-accent/40",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="account-type"
                  value={type}
                  checked={accountType === type}
                  onChange={() => setAccountType(type)}
                  className="sr-only"
                />
                {accountTypeLabels[type]}
              </label>
            ))}
          </div>
        </fieldset>

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

        {isService ? (
          <p className="rounded-xl border border-edge bg-subtle p-4 text-sm text-muted">
            {t("userNew.serviceNoPassword")}
          </p>
        ) : (
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </div>
        )}

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
