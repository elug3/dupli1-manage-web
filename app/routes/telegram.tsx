import { useEffect, useState } from "react";
import {
  type NotificationSettings,
  type TelegramAlertFlags,
  type TelegramSubscription,
  type TelegramSubscriptionStatus,
  acceptTelegramSubscription,
  createTelegramSubscription,
  deleteTelegramSubscription,
  getNotificationSettings,
  getTelegramSubscriptions,
  rejectTelegramSubscription,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

export function meta() {
  return [{ title: "Telegram | Dupli1 Admin" }];
}

const inputCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";

const STATUS_TAB_VALUES: (TelegramSubscriptionStatus | "all")[] = [
  "all",
  "pending",
  "accepted",
  "rejected",
];

const STATUS_BADGE_CLASS: Record<TelegramSubscriptionStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-slate-100 text-slate-600",
};

/** Settings feature flags surfaced as status pills, in operator-relevant order. */
const STATUS_FEATURES = [
  ["telegram_enabled", "telegram.featureTelegramEnabled"],
  ["telegram_webhook", "telegram.featureTelegramWebhook"],
  ["telegram_subscriptions_db", "telegram.featureSubscriptionsDb"],
  ["order_chat_configured", "telegram.featureOrderChat"],
  ["product_chat_configured", "telegram.featureProductChat"],
] as const;

export default function Telegram() {
  const { notify } = useNotify();
  const { t, formatDateTime } = useI18n();
  const [subscriptions, setSubscriptions] = useState<TelegramSubscription[]>([]);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TelegramSubscriptionStatus | "all">(
    "all"
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const [userId, setUserId] = useState("");
  const [chatId, setChatId] = useState("");
  const [chatLabel, setChatLabel] = useState("");
  const [newAlertOrder, setNewAlertOrder] = useState(true);
  const [newAlertProduct, setNewAlertProduct] = useState(true);
  const [adding, setAdding] = useState(false);

  // Alert flags an operator picks before accepting a pending row; both default on.
  const [pendingAlerts, setPendingAlerts] = useState<
    Record<string, TelegramAlertFlags>
  >({});

  function loadSubscriptions() {
    setLoading(true);
    setError(null);
    getTelegramSubscriptions()
      .then(setSubscriptions)
      .catch((err) => {
        setSubscriptions([]);
        const raw =
          err instanceof Error ? err.message : t("telegram.failedToLoad");
        // Upstream notification service with no AUTH_JWKS_URL returns this 503.
        setError(
          /auth not configured/i.test(raw)
            ? t("telegram.authNotConfigured")
            : raw
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadSubscriptions();
    void getNotificationSettings().then(setSettings);
  }, []);

  function alertsFor(sub: TelegramSubscription): TelegramAlertFlags {
    return (
      pendingAlerts[sub.id] ?? {
        alert_order: sub.alert_order,
        alert_product: sub.alert_product,
      }
    );
  }

  function togglePendingAlert(
    sub: TelegramSubscription,
    key: keyof TelegramAlertFlags
  ) {
    const current = alertsFor(sub);
    setPendingAlerts((prev) => ({
      ...prev,
      [sub.id]: { ...current, [key]: !current[key] },
    }));
  }

  function replaceSubscription(updated: TelegramSubscription) {
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    );
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUserId = userId.trim();
    const trimmedChatId = chatId.trim();
    if (!trimmedUserId && !trimmedChatId) {
      notify(t("telegram.needUserIdOrChatId"), "error");
      return;
    }
    const parsedUserId = trimmedUserId ? Number(trimmedUserId) : undefined;
    if (parsedUserId !== undefined && !Number.isSafeInteger(parsedUserId)) {
      notify(t("telegram.invalidUserId"), "error");
      return;
    }

    setAdding(true);
    try {
      const created = await createTelegramSubscription({
        telegram_user_id: parsedUserId,
        chat_id: trimmedChatId || undefined,
        chat_label: chatLabel.trim() || undefined,
        alert_order: newAlertOrder,
        alert_product: newAlertProduct,
      });
      setSubscriptions((prev) => [created, ...prev]);
      setUserId("");
      setChatId("");
      setChatLabel("");
      notify(t("telegram.subscriptionAdded"));
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("telegram.failedToAdd"),
        "error"
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleAccept(sub: TelegramSubscription) {
    setBusyId(sub.id);
    try {
      replaceSubscription(await acceptTelegramSubscription(sub.id, alertsFor(sub)));
      notify(t("telegram.subscriptionAccepted"));
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("telegram.failedToAccept"),
        "error"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(sub: TelegramSubscription) {
    setBusyId(sub.id);
    try {
      replaceSubscription(await rejectTelegramSubscription(sub.id));
      notify(t("telegram.subscriptionRejected"));
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("telegram.failedToReject"),
        "error"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(sub: TelegramSubscription) {
    if (!window.confirm(t("telegram.confirmDelete"))) return;
    setBusyId(sub.id);
    try {
      await deleteTelegramSubscription(sub.id);
      setSubscriptions((prev) => prev.filter((s) => s.id !== sub.id));
      notify(t("telegram.subscriptionDeleted"));
    } catch (err) {
      notify(
        err instanceof Error ? err.message : t("telegram.failedToDelete"),
        "error"
      );
    } finally {
      setBusyId(null);
    }
  }

  const filtered =
    activeTab === "all"
      ? subscriptions
      : subscriptions.filter((s) => s.status === activeTab);

  const counts = subscriptions.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<TelegramSubscriptionStatus, number>
  );

  const statusTabLabel = (value: TelegramSubscriptionStatus | "all"): string => {
    switch (value) {
      case "all":
        return t("telegram.tabAll");
      case "pending":
        return t("telegram.tabPending");
      case "accepted":
        return t("telegram.tabAccepted");
      case "rejected":
        return t("telegram.tabRejected");
      default:
        return value;
    }
  };

  const statusLabel = (status: TelegramSubscriptionStatus): string => {
    switch (status) {
      case "pending":
        return t("telegram.statusPending");
      case "accepted":
        return t("telegram.statusAccepted");
      case "rejected":
        return t("telegram.statusRejected");
      default:
        return status;
    }
  };

  const headers = [
    t("telegram.colChat"),
    t("telegram.colUserId"),
    t("telegram.colStatus"),
    t("telegram.colAlerts"),
    t("telegram.colRegistered"),
    "",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink sm:text-2xl">
          {t("telegram.title")}
        </h1>
        <p className="mt-0.5 text-sm text-muted">{t("telegram.subtitle")}</p>
      </div>

      {settings?.features && (
        <div className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            {t("telegram.serviceStatus")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUS_FEATURES.map(([feature, labelKey]) => {
              const on = settings.features?.[feature] === true;
              return (
                <span
                  key={feature}
                  title={
                    on ? t("telegram.configured") : t("telegram.notConfigured")
                  }
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                    on
                      ? "bg-success-bg text-success-fg"
                      : "bg-page text-faint",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "h-1.5 w-1.5 rounded-full",
                      on ? "bg-emerald-500" : "bg-edge",
                    ].join(" ")}
                  />
                  {t(labelKey)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <form
        onSubmit={handleAdd}
        className="grid gap-4 rounded-2xl border border-edge bg-surface p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:grid-cols-3"
      >
        <div className="sm:col-span-3">
          <h2 className="text-sm font-semibold text-ink">
            {t("telegram.addTitle")}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{t("telegram.addHint")}</p>
        </div>
        <Field label={t("telegram.fieldUserId")} id="telegram-user-id">
          <input
            id="telegram-user-id"
            inputMode="numeric"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className={inputCls}
            placeholder={t("telegram.fieldUserIdPlaceholder")}
          />
        </Field>
        <Field label={t("telegram.fieldChatId")} id="telegram-chat-id">
          <input
            id="telegram-chat-id"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            className={inputCls}
            placeholder={t("telegram.fieldChatIdPlaceholder")}
          />
        </Field>
        <Field label={t("telegram.fieldChatLabel")} id="telegram-chat-label">
          <input
            id="telegram-chat-label"
            value={chatLabel}
            onChange={(e) => setChatLabel(e.target.value)}
            className={inputCls}
            placeholder={t("telegram.fieldChatLabelPlaceholder")}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-3">
          <Checkbox
            id="telegram-alert-order"
            label={t("telegram.alertOrders")}
            checked={newAlertOrder}
            onChange={setNewAlertOrder}
          />
          <Checkbox
            id="telegram-alert-product"
            label={t("telegram.alertProducts")}
            checked={newAlertProduct}
            onChange={setNewAlertProduct}
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {adding ? t("telegram.adding") : t("telegram.add")}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          {error}
        </div>
      )}

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex w-max max-w-full flex-wrap gap-1 rounded-xl border border-edge bg-surface p-1 shadow-[0_1px_3px_rgba(28,27,31,0.04)] sm:w-fit">
          {STATUS_TAB_VALUES.map((value) => {
            const count =
              value === "all" ? subscriptions.length : (counts[value] ?? 0);
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveTab(value)}
                className={[
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  activeTab === value
                    ? "bg-accent text-white shadow-sm"
                    : "text-muted hover:bg-page hover:text-ink",
                ].join(" ")}
              >
                {statusTabLabel(value)}
                {count > 0 && (
                  <span
                    className={[
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      activeTab === value
                        ? "bg-white/20 text-white"
                        : "bg-page text-muted",
                    ].join(" ")}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-edge bg-surface shadow-[0_1px_4px_rgba(28,27,31,0.04)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-faint">{t("telegram.noSubscriptions")}</p>
            <p className="mt-1 text-sm text-soft">
              {t("telegram.noSubscriptionsHint")}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-faint">
            {t("telegram.noSubscriptionsInStatus")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge-soft bg-subtle text-left">
                  {headers.map((h, i) => (
                    <th
                      key={h || `actions-${i}`}
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub) => {
                  const alerts = alertsFor(sub);
                  const editable = sub.status === "pending";
                  return (
                    <tr
                      key={sub.id}
                      className="border-b border-edge-soft last:border-0 hover:bg-subtle"
                    >
                      <td className="px-5 py-3.5">
                        <span className="block font-mono text-xs font-semibold text-ink">
                          {sub.chat_id || t("common.emptyValue")}
                        </span>
                        {(sub.chat_label || sub.username) && (
                          <span className="block text-xs text-muted">
                            {sub.chat_label ||
                              (sub.username ? `@${sub.username}` : "")}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-muted">
                        {sub.telegram_user_id ?? t("common.emptyValue")}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                            STATUS_BADGE_CLASS[sub.status] ??
                              "bg-slate-100 text-slate-600",
                          ].join(" ")}
                        >
                          {statusLabel(sub.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          <AlertChip
                            label={t("telegram.alertOrdersShort")}
                            on={alerts.alert_order}
                            editable={editable}
                            disabled={busyId === sub.id}
                            onToggle={() => togglePendingAlert(sub, "alert_order")}
                          />
                          <AlertChip
                            label={t("telegram.alertProductsShort")}
                            on={alerts.alert_product}
                            editable={editable}
                            disabled={busyId === sub.id}
                            onToggle={() =>
                              togglePendingAlert(sub, "alert_product")
                            }
                          />
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-faint">
                        {formatDateTime(sub.created_at, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          {sub.status === "pending" && (
                            <>
                              <button
                                type="button"
                                disabled={busyId === sub.id}
                                onClick={() => handleAccept(sub)}
                                className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent/40 hover:bg-panel hover:text-accent disabled:opacity-50"
                              >
                                {t("telegram.accept")}
                              </button>
                              <button
                                type="button"
                                disabled={busyId === sub.id}
                                onClick={() => handleReject(sub)}
                                className="rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-page disabled:opacity-50"
                              >
                                {t("telegram.reject")}
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            disabled={busyId === sub.id}
                            onClick={() => handleDelete(sub)}
                            className="text-xs font-semibold text-danger-fg hover:underline disabled:opacity-50"
                          >
                            {t("telegram.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AlertChip({
  label,
  on,
  editable,
  disabled,
  onToggle,
}: {
  label: string;
  on: boolean;
  editable: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const cls = [
    "rounded-full px-2.5 py-1 text-xs font-semibold",
    on ? "bg-accent/10 text-accent" : "bg-page text-faint",
  ].join(" ");

  if (!editable) return <span className={cls}>{label}</span>;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={onToggle}
      className={`${cls} transition hover:opacity-80 disabled:opacity-50`}
    >
      {label}
    </button>
  );
}

function Checkbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-ink">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-edge text-accent focus:ring-accent/20"
      />
      {label}
    </label>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-muted"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
