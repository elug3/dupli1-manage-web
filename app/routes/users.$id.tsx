import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  type AccountType,
  ALL_PERMISSIONS,
  type AuthUser,
  type CreatedApiKey,
  createApiKey,
  formatPermissions,
  getUserById,
  listApiKeys,
  PERMISSION_CATALOG,
  permissionGrants,
  revokeApiKey,
  type ServiceApiKey,
  setUserPassword,
  setUserPermissions,
  setUserStatus,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

const ACCOUNT_TYPES: AccountType[] = ["customer", "manager", "service"];

export function meta() {
  return [{ title: "User | Dupli1 Admin" }];
}

type DetailTab = "state" | "credentials" | "permissions";

function initialTab(value: string | null): DetailTab {
  return value === "credentials" || value === "permissions" ? value : "state";
}

/** Expiry choices for a new API key, in days; `null` never expires. */
const KEY_EXPIRY_DAYS: (number | null)[] = [30, 90, 365, null];

const inputCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function UserDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>(() =>
    initialTab(searchParams.get("tab"))
  );

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
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <Link to="/users" className="text-sm text-accent hover:underline">
          {t("userDetail.backToUsers")}
        </Link>
        <div className="rounded-2xl border border-edge bg-surface p-10 text-center text-muted">
          {error ?? t("userDetail.userNotFound")}
        </div>
      </div>
    );
  }

  // Service accounts have no password; their credentials are API keys.
  const isService = user.account_type === "service";

  const detailTabs: {
    labelKey:
      | "userDetail.tabState"
      | "userDetail.tabCredentials"
      | "userDetail.tabApiKeys"
      | "userDetail.tabPermissions";
    value: DetailTab;
  }[] = [
    { labelKey: "userDetail.tabState", value: "state" },
    {
      labelKey: isService
        ? "userDetail.tabApiKeys"
        : "userDetail.tabCredentials",
      value: "credentials",
    },
    { labelKey: "userDetail.tabPermissions", value: "permissions" },
  ];

  return (
    <div className="space-y-6">
      <Link to="/users" className="text-sm text-accent hover:underline">
        {t("userDetail.backToUsers")}
      </Link>

      <div className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8">
        <h1 className="text-2xl font-bold text-ink">{user.email}</h1>
        <p className="mt-1 font-mono text-sm text-muted">{user.user_id}</p>
        <p className="mt-2 text-sm text-muted">
          {t("userDetail.accountTypeAndPermissions", {
            accountType: user.account_type,
            permissions: formatPermissions(user.permissions),
          })}
        </p>

        <div className="mt-6 flex flex-wrap gap-2 border-b border-edge-soft pb-4">
          {detailTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={[
                "rounded-full px-4 py-1.5 text-sm font-medium transition",
                activeTab === tab.value
                  ? "bg-accent text-white"
                  : "border border-edge bg-surface text-muted hover:border-accent/40",
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
          {activeTab === "credentials" &&
            (isService ? (
              <ApiKeysTab user={user} />
            ) : (
              <CredentialsTab user={user} />
            ))}
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
  ];
  if (user.account_type === "service") {
    // No password, so no password lockout: keys ignore it, and
    // deactivating the account is what stops every key at once.
    fields.push([
      t("userDetail.fieldSignIn"),
      t("userDetail.signInApiKeysOnly"),
    ]);
  } else {
    fields.push(
      [
        t("userDetail.fieldLockedAt"),
        user.locked_at
          ? formatDateTime(user.locked_at)
          : t("common.emptyValue"),
      ],
      [
        t("userDetail.fieldFailedLoginAttempts"),
        String(user.failed_login_attempts),
      ]
    );
  }

  return (
    <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
              {label}
            </dt>
            <dd className="mt-1 text-sm text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-xl border border-edge bg-subtle p-4">
        <p className="text-sm text-muted">{t("userDetail.stateHint")}</p>
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

function CredentialsTab({ user }: { user: AuthUser }) {
  const userId = user.user_id;
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
      <p className="text-sm text-muted">{t("userDetail.credentialsHint")}</p>
      {!user.has_password && (
        <p className="rounded-xl border border-edge bg-subtle p-4 text-sm text-muted">
          {t("userDetail.noPasswordSet")}
        </p>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="text-xs font-semibold uppercase tracking-wide text-muted"
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
          className="text-xs font-semibold uppercase tracking-wide text-muted"
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
        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
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
    manager: t("userDetail.accountTypeManager"),
    service: t("userDetail.accountTypeService"),
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted">{t("userDetail.permissionsHint")}</p>

      <div className="space-y-1.5">
        <label
          htmlFor="account-type"
          className="text-xs font-semibold uppercase tracking-wide text-muted"
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
        {accountType === "service" && user.account_type !== "service" && (
          <p className="text-sm text-warn-fg">
            {t("userDetail.convertToServiceWarning")}
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {ALL_PERMISSIONS.map((permission) => (
          <label
            key={permission}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-edge bg-subtle px-4 py-3 text-sm text-ink"
          >
            <input
              type="checkbox"
              checked={selectedPermissions.includes(permission)}
              onChange={() => togglePermission(permission)}
              className="size-4 rounded border-[#C8C4D8] text-accent focus:ring-accent/20"
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
        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
      >
        {saving ? t("common.saving") : t("userDetail.savePermissions")}
      </button>
    </form>
  );
}

function ApiKeysTab({ user }: { user: AuthUser }) {
  const { notify } = useNotify();
  const { t, formatDateTime } = useI18n();
  const [keys, setKeys] = useState<ServiceApiKey[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [expiryDays, setExpiryDays] = useState<number | null>(90);
  const [scope, setScope] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  // The plaintext lives only here, only until dismissed, and is gone when
  // the tab unmounts — auth stored its hash and cannot show it again.
  const [created, setCreated] = useState<CreatedApiKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    listApiKeys(user.user_id)
      .then((found) => {
        if (!cancelled) setKeys(found);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : t("userDetail.failedToLoadApiKeys")
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user.user_id]);

  // A key can never exceed its account, so only offer what the account holds.
  const scopeOptions = PERMISSION_CATALOG.filter((permission) =>
    permissionGrants(user.permissions, permission)
  );

  function toggleScope(permission: string) {
    setScope((current) =>
      current.includes(permission)
        ? current.filter((value) => value !== permission)
        : [...current, permission]
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const key = await createApiKey(user.user_id, {
        name: name.trim(),
        ...(scope.length > 0 ? { permissions: scope } : {}),
        ...(expiryDays != null ? { expires_in_days: expiryDays } : {}),
      });
      const { api_key: _plaintext, ...listed } = key;
      setKeys((current) => [listed, ...(current ?? [])]);
      setCreated(key);
      setName("");
      setScope([]);
      notify(t("userDetail.apiKeyCreated"));
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("userDetail.failedToCreateApiKey"),
        "error"
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(key: ServiceApiKey) {
    if (!window.confirm(t("userDetail.confirmRevokeApiKey", { name: key.name }))) {
      return;
    }
    setRevoking(key.id);
    try {
      await revokeApiKey(key.id);
      const revokedAt = new Date().toISOString();
      setKeys((current) =>
        (current ?? []).map((k) =>
          k.id === key.id ? { ...k, revoked_at: revokedAt } : k
        )
      );
      notify(t("userDetail.apiKeyRevoked"));
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("userDetail.failedToRevokeApiKey"),
        "error"
      );
    } finally {
      setRevoking(null);
    }
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.api_key);
      notify(t("userDetail.apiKeyCopied"));
    } catch {
      notify(t("userDetail.apiKeyCopyFailed"), "error");
    }
  }

  function keyStatus(key: ServiceApiKey): string {
    if (key.revoked_at) return t("userDetail.apiKeyStatusRevoked");
    if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) {
      return t("userDetail.apiKeyStatusExpired");
    }
    return key.expires_at
      ? t("userDetail.apiKeyExpires", { date: formatDateTime(key.expires_at) })
      : t("userDetail.apiKeyNeverExpires");
  }

  const expiryLabel = (days: number | null) =>
    days == null
      ? t("userDetail.apiKeyExpiryNever")
      : t("userDetail.apiKeyExpiryDays", { days });

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{t("userDetail.apiKeysHint")}</p>

      {created && (
        <div className="space-y-3 rounded-xl border border-edge bg-warn-bg p-4">
          <p className="text-sm font-semibold text-ink">
            {t("userDetail.apiKeyShownOnce", { name: created.name })}
          </p>
          <code className="block break-all rounded-lg border border-edge bg-panel px-3 py-2 font-mono text-xs text-ink">
            {created.api_key}
          </code>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              {t("userDetail.copyApiKey")}
            </button>
            <button
              type="button"
              onClick={() => setCreated(null)}
              className="rounded-xl border border-edge bg-surface px-4 py-2 text-sm font-medium text-muted transition hover:border-accent/40"
            >
              {t("userDetail.apiKeyDone")}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-edge">
        {loadError ? (
          <p className="p-6 text-center text-sm text-muted">{loadError}</p>
        ) : keys == null ? (
          <div className="flex justify-center p-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : keys.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            {t("userDetail.noApiKeys")}
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-subtle text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{t("userDetail.apiKeyColName")}</th>
                <th className="px-4 py-2.5 font-semibold">{t("userDetail.apiKeyColKey")}</th>
                <th className="px-4 py-2.5 font-semibold">{t("userDetail.apiKeyColScope")}</th>
                <th className="px-4 py-2.5 font-semibold">{t("userDetail.apiKeyColStatus")}</th>
                <th className="px-4 py-2.5 font-semibold">{t("userDetail.apiKeyColLastUsed")}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-edge-soft">
              {keys.map((key) => (
                <tr key={key.id} className={key.revoked_at ? "opacity-50" : undefined}>
                  <td className="px-4 py-3 text-ink">
                    {key.name}
                    {key.source === "env" && (
                      <span className="ml-2 rounded-full border border-edge px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">
                        {t("userDetail.apiKeySourceEnv")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{key.prefix}…</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {key.permissions.length === 0
                      ? t("userDetail.apiKeyScopeInherit")
                      : key.permissions.join(", ")}
                  </td>
                  <td className="px-4 py-3 text-muted">{keyStatus(key)}</td>
                  <td className="px-4 py-3 text-muted">
                    {key.last_used_at
                      ? formatDateTime(key.last_used_at)
                      : t("common.emptyValue")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!key.revoked_at &&
                      (key.source === "env" ? (
                        <span
                          className="text-xs text-faint"
                          title={t("userDetail.apiKeyEnvManaged")}
                        >
                          {t("userDetail.apiKeyEnvManagedShort")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRevoke(key)}
                          disabled={revoking === key.id}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/10 disabled:opacity-60"
                        >
                          {revoking === key.id
                            ? t("common.saving")
                            : t("userDetail.revokeApiKey")}
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-xl border border-edge bg-subtle p-4"
      >
        <h2 className="text-sm font-semibold text-ink">
          {t("userDetail.createApiKey")}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="api-key-name"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              {t("userDetail.apiKeyName")}
            </label>
            <input
              id="api-key-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("userDetail.apiKeyNamePlaceholder")}
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="api-key-expiry"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              {t("userDetail.apiKeyExpiry")}
            </label>
            <select
              id="api-key-expiry"
              value={expiryDays == null ? "" : String(expiryDays)}
              onChange={(e) =>
                setExpiryDays(e.target.value === "" ? null : Number(e.target.value))
              }
              className={inputCls}
            >
              {KEY_EXPIRY_DAYS.map((days) => (
                <option key={days ?? "never"} value={days == null ? "" : String(days)}>
                  {expiryLabel(days)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("userDetail.apiKeyScope")}
          </p>
          <p className="text-xs text-muted">{t("userDetail.apiKeyScopeHint")}</p>
          {scopeOptions.length === 0 ? (
            <p className="text-sm text-muted">{t("userDetail.apiKeyNoScopeOptions")}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {scopeOptions.map((permission) => (
                <label
                  key={permission}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-edge bg-surface px-4 py-2.5 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    checked={scope.includes(permission)}
                    onChange={() => toggleScope(permission)}
                    className="size-4 rounded border-[#C8C4D8] text-accent focus:ring-accent/20"
                  />
                  <span className="font-mono text-xs font-medium">{permission}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
        >
          {creating ? t("userNew.creating") : t("userDetail.createApiKey")}
        </button>
      </form>
    </div>
  );
}
