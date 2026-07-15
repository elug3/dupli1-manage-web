import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  type AccountType,
  ALL_PERMISSIONS,
  type AuthUser,
  formatPermissions,
  getUserById,
  setUserPassword,
  setUserPermissions,
  setUserStatus,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

const ACCOUNT_TYPES: AccountType[] = ["customer", "admin", "service"];

export function meta() {
  return [{ title: "User | Dupli1 Admin" }];
}

type DetailTab = "state" | "credentials" | "permissions";

const inputCls =
  "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";

export default function UserDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("state");

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getUserById(id)
      .then((found) => {
        if (cancelled) return;
        if (!found) {
          setError(t("userDetail.userNotFound"));
          setUser(null);
          return;
        }
        setUser(found);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t("userDetail.failedToLoad")
          );
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <Link to="/users" className="text-sm text-[#6D4AFF] hover:underline">
          {t("userDetail.backToUsers")}
        </Link>
        <div className="rounded-2xl border border-[#E5E3EE] bg-white p-10 text-center text-[#6B6480]">
          {error ?? t("userDetail.userNotFound")}
        </div>
      </div>
    );
  }

  const detailTabs: {
    labelKey:
      | "userDetail.tabState"
      | "userDetail.tabCredentials"
      | "userDetail.tabPermissions";
    value: DetailTab;
  }[] = [
    { labelKey: "userDetail.tabState", value: "state" },
    { labelKey: "userDetail.tabCredentials", value: "credentials" },
    { labelKey: "userDetail.tabPermissions", value: "permissions" },
  ];

  return (
    <div className="space-y-6">
      <Link to="/users" className="text-sm text-[#6D4AFF] hover:underline">
        {t("userDetail.backToUsers")}
      </Link>

      <div className="rounded-2xl border border-[#E5E3EE] bg-white p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8">
        <h1 className="text-2xl font-bold text-[#1C1B1F]">{user.email}</h1>
        <p className="mt-1 font-mono text-sm text-[#6B6480]">{user.user_id}</p>
        <p className="mt-2 text-sm text-[#6B6480]">
          {t("userDetail.accountTypeAndPermissions", {
            accountType: user.account_type,
            permissions: formatPermissions(user.permissions),
          })}
        </p>

        <div className="mt-6 flex flex-wrap gap-2 border-b border-[#F0EEF8] pb-4">
          {detailTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={[
                "rounded-full px-4 py-1.5 text-sm font-medium transition",
                activeTab === tab.value
                  ? "bg-[#6D4AFF] text-white"
                  : "border border-[#E5E3EE] bg-white text-[#6B6480] hover:border-[#6D4AFF]/40",
              ].join(" ")}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {activeTab === "state" && (
            <StateTab user={user} onUpdated={setUser} />
          )}
          {activeTab === "credentials" && <CredentialsTab userId={user.user_id} />}
          {activeTab === "permissions" && (
            <PermissionsTab user={user} onUpdated={setUser} />
          )}
        </div>
      </div>
    </div>
  );
}

function StateTab({
  user,
  onUpdated,
}: {
  user: AuthUser;
  onUpdated: (user: AuthUser) => void;
}) {
  const { notify } = useNotify();
  const { t, formatDateTime } = useI18n();
  const [saving, setSaving] = useState(false);

  async function handleToggle() {
    setSaving(true);
    try {
      const updated = await setUserStatus(user.user_id, !user.is_active);
      onUpdated(updated);
      notify(
        updated.is_active
          ? t("userDetail.userActivated")
          : t("userDetail.userDeactivated")
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("userDetail.failedToUpdateStatus"),
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  const fields: [string, string][] = [
    [
      t("userDetail.fieldActive"),
      user.is_active ? t("userDetail.yes") : t("userDetail.no"),
    ],
    [
      t("userDetail.fieldLockedAt"),
      user.locked_at
        ? formatDateTime(user.locked_at)
        : t("common.emptyValue"),
    ],
    [
      t("userDetail.fieldFailedLoginAttempts"),
      String(user.failed_login_attempts),
    ],
  ];

  return (
    <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#9D98B3]">
              {label}
            </dt>
            <dd className="mt-1 text-sm text-[#1C1B1F]">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] p-4">
        <p className="text-sm text-[#6B6480]">{t("userDetail.stateHint")}</p>
        <button
          type="button"
          onClick={handleToggle}
          disabled={saving}
          className={[
            "mt-4 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60",
            user.is_active
              ? "bg-red-500 hover:bg-red-600"
              : "bg-emerald-600 hover:bg-emerald-700",
          ].join(" ")}
        >
          {saving
            ? t("common.saving")
            : user.is_active
              ? t("userDetail.deactivateUser")
              : t("userDetail.activateUser")}
        </button>
      </div>
    </div>
  );
}

function CredentialsTab({ userId }: { userId: string }) {
  const { notify } = useNotify();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      notify(t("userDetail.passwordsDoNotMatch"), "error");
      return;
    }

    setSaving(true);
    try {
      await setUserPassword(userId, password);
      setPassword("");
      setConfirmPassword("");
      notify(t("userDetail.passwordUpdated"));
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : t("userDetail.failedToUpdatePassword"),
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4">
      <p className="text-sm text-[#6B6480]">{t("userDetail.credentialsHint")}</p>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]"
        >
          {t("userDetail.newPassword")}
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

      <div className="space-y-1.5">
        <label
          htmlFor="confirm-password"
          className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]"
        >
          {t("userDetail.confirmPassword")}
        </label>
        <input
          id="confirm-password"
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputCls}
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60"
      >
        {saving ? t("common.saving") : t("userDetail.updatePassword")}
      </button>
    </form>
  );
}

function PermissionsTab({
  user,
  onUpdated,
}: {
  user: AuthUser;
  onUpdated: (user: AuthUser) => void;
}) {
  const { notify } = useNotify();
  const { t } = useI18n();
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    user.permissions
  );
  const [accountType, setAccountType] = useState<AccountType>(
    user.account_type
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedPermissions(user.permissions);
    setAccountType(user.account_type);
  }, [user.permissions, user.account_type]);

  function togglePermission(permission: string) {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((value) => value !== permission)
        : [...current, permission]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setSaving(true);
    try {
      const updated = await setUserPermissions(
        user.user_id,
        selectedPermissions,
        accountType
      );
      onUpdated(updated);
      notify(t("userDetail.permissionsUpdated"));
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : t("userDetail.failedToUpdatePermissions"),
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  const accountTypeLabels: Record<AccountType, string> = {
    customer: t("userDetail.accountTypeCustomer"),
    admin: t("userDetail.accountTypeAdmin"),
    service: t("userDetail.accountTypeService"),
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-[#6B6480]">{t("userDetail.permissionsHint")}</p>

      <div className="space-y-1.5">
        <label
          htmlFor="account-type"
          className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]"
        >
          {t("userDetail.accountType")}
        </label>
        <select
          id="account-type"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as AccountType)}
          className={inputCls}
        >
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {accountTypeLabels[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {ALL_PERMISSIONS.map((permission) => (
          <label
            key={permission}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] px-4 py-3 text-sm text-[#1C1B1F]"
          >
            <input
              type="checkbox"
              checked={selectedPermissions.includes(permission)}
              onChange={() => togglePermission(permission)}
              className="size-4 rounded border-[#C8C4D8] text-[#6D4AFF] focus:ring-[#6D4AFF]/20"
            />
            <span className="font-mono text-xs font-medium">
              {permission}
            </span>
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-[#6D4AFF] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60"
      >
        {saving ? t("common.saving") : t("userDetail.savePermissions")}
      </button>
    </form>
  );
}
