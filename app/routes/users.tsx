import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  type AuthUser,
  formatPermissions,
  isCustomerUser,
  isManagerUser,
  isServiceUser,
  listUsers,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";

export function meta() {
  return [{ title: "Users | Dupli1 Admin" }];
}

type UserTab = "customers" | "managers" | "services";

function userMatchesTab(user: AuthUser, tab: UserTab): boolean {
  switch (tab) {
    case "customers":
      return isCustomerUser(user);
    case "managers":
      return isManagerUser(user);
    case "services":
      return isServiceUser(user);
  }
}

function accountTypeLabel(
  accountType: AuthUser["account_type"],
  t: (key: string) => string
): string {
  switch (accountType) {
    case "customer":
      return t("userDetail.accountTypeCustomer");
    case "manager":
      return t("userDetail.accountTypeManager");
    case "service":
      return t("userDetail.accountTypeService");
  }
}

export default function Users() {
  const { t } = useI18n();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<UserTab>("customers");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    listUsers()
      .then(setUsers)
      .catch((err) => {
        setUsers([]);
        setError(err instanceof Error ? err.message : t("users.failedToLoad"));
      })
      .finally(() => setLoading(false));
  }, [t]);

  const counts = useMemo(
    () => ({
      customers: users.filter(isCustomerUser).length,
      managers: users.filter(isManagerUser).length,
      services: users.filter(isServiceUser).length,
    }),
    [users]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users.filter((user) => {
      if (!userMatchesTab(user, activeTab)) return false;
      if (!needle) return true;
      return (
        user.email.toLowerCase().includes(needle) ||
        user.user_id.toLowerCase().includes(needle) ||
        user.account_type.toLowerCase().includes(needle) ||
        user.permissions.some((perm) => perm.toLowerCase().includes(needle))
      );
    });
  }, [users, activeTab, search]);

  const tabs: {
    labelKey: "users.tabCustomers" | "users.tabManagers" | "users.tabServices";
    value: UserTab;
  }[] = [
    { labelKey: "users.tabCustomers", value: "customers" },
    { labelKey: "users.tabManagers", value: "managers" },
    { labelKey: "users.tabServices", value: "services" },
  ];

  const headers = [
    t("users.colEmail"),
    t("users.colAccountType"),
    t("users.colPermissions"),
    t("users.colStatus"),
    "",
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">
            {t("users.title")}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{t("users.subtitle")}</p>
        </div>
        <Link
          to="/users/new"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover active:scale-[0.98] sm:w-auto"
        >
          <PlusIcon />
          {t("users.newUser")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={[
              "rounded-full px-4 py-1.5 text-sm font-medium transition",
              activeTab === tab.value
                ? "bg-accent text-white"
                : "border border-edge bg-surface text-muted hover:border-accent/40",
            ].join(" ")}
          >
            {t("users.tabWithCount", {
              label: t(tab.labelKey),
              count: counts[tab.value],
            })}
          </button>
        ))}
      </div>

      <input
        type="search"
        placeholder={t("users.filterPlaceholder")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md rounded-xl border border-edge bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />

      {error && (
        <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-edge bg-surface shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-faint">
            {t("users.noUsersFound")}
          </div>
        ) : (
          <>
            <div className="divide-y divide-edge-soft md:hidden">
              {filtered.map((user) => (
                <UserCard key={user.user_id} user={user} />
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge-soft bg-subtle text-left">
                    {headers.map((heading, i) => (
                      <th
                        key={heading || `actions-${i}`}
                        className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr
                      key={user.user_id}
                      className="border-b border-edge-soft last:border-0 hover:bg-subtle"
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-ink">{user.email}</p>
                        <p className="mt-0.5 font-mono text-xs text-muted">
                          {user.user_id}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-muted">
                        {accountTypeLabel(user.account_type, t)}
                      </td>
                      <td className="px-5 py-3.5 text-muted">
                        {formatPermissions(user.permissions)}
                      </td>
                      <td className="px-5 py-3.5">
                        <UserStatusBadge user={user} />
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          to={`/users/${encodeURIComponent(user.user_id)}`}
                          className="text-xs font-semibold text-accent hover:underline"
                        >
                          {t("users.detailsArrow")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function UserCard({ user }: { user: AuthUser }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3 p-4">
      <div>
        <p className="font-medium text-ink">{user.email}</p>
        <p className="mt-1 font-mono text-xs text-muted">{user.user_id}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="rounded-full bg-page px-2.5 py-1">
          {accountTypeLabel(user.account_type, t)}
        </span>
        <span className="rounded-full bg-page px-2.5 py-1">
          {formatPermissions(user.permissions)}
        </span>
        <UserStatusBadge user={user} />
      </div>
      <Link
        to={`/users/${encodeURIComponent(user.user_id)}`}
        className="inline-flex text-xs font-semibold text-accent hover:underline"
      >
        {t("users.detailsArrow")}
      </Link>
    </div>
  );
}

function UserStatusBadge({ user }: { user: AuthUser }) {
  const { t } = useI18n();
  if (user.locked_at) {
    return (
      <span className="inline-flex rounded-full bg-warn-bg px-2.5 py-1 text-xs font-medium text-warn-fg">
        {t("users.statusLocked")}
      </span>
    );
  }

  return (
    <span
      className={[
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
        user.is_active
          ? "bg-success-bg text-success-fg"
          : "bg-danger-bg text-danger-fg",
      ].join(" ")}
    >
      {user.is_active ? t("users.statusActive") : t("users.statusInactive")}
    </span>
  );
}

function PlusIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
