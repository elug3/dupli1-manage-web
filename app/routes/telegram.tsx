import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type {
  NotificationSettings,
  TelegramAlertFlags,
  TelegramSubscription,
  TelegramSubscriptionStatus,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";
import {
  acceptTelegramSubscriptionServer,
  createTelegramSubscriptionServer,
  deleteTelegramSubscriptionServer,
  loadNotificationSettings,
  loadTelegramSubscriptions,
  rejectTelegramSubscriptionServer,
} from "~/lib/server/notification.server";
import type { Route } from "./+types/telegram";

export function meta() {
  return [{ title: "Telegram | Dupli1 Admin" }];
}

export type TelegramLoaderData = {
  subscriptions: TelegramSubscription[];
  settings: NotificationSettings | null;
  error: string | null;
};

export type TelegramActionData = {
  ok: boolean;
  intent?: string;
  error?: string;
};

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

function mapLoadError(raw: string, authNotConfigured: string): string {
  return /auth not configured/i.test(raw) ? authNotConfigured : raw;
}

export async function loader({
  request,
}: Route.LoaderArgs): Promise<TelegramLoaderData> {
  const [settings, subscriptionsResult] = await Promise.all([
    loadNotificationSettings(request),
    loadTelegramSubscriptions(request)
      .then((subscriptions) => ({ subscriptions, error: null as string | null }))
      .catch((err: unknown) => ({
        subscriptions: [] as TelegramSubscription[],
        error:
          err instanceof Error
            ? err.message
            : "Failed to load Telegram subscriptions",
      })),
  ]);

  return {
    settings,
    subscriptions: subscriptionsResult.subscriptions,
    error: subscriptionsResult.error,
  };
}

export async function action({
  request,
}: Route.ActionArgs): Promise<TelegramActionData> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  try {
    switch (intent) {
      case "create": {
        const trimmedUserId = String(formData.get("telegram_user_id") ?? "").trim();
        const trimmedChatId = String(formData.get("chat_id") ?? "").trim();
        if (!trimmedUserId && !trimmedChatId) {
          return {
            ok: false,
            intent,
            error: "Telegram user ID or chat ID is required",
          };
        }
        const parsedUserId = trimmedUserId ? Number(trimmedUserId) : undefined;
        if (
          parsedUserId !== undefined &&
          !Number.isSafeInteger(parsedUserId)
        ) {
          return { ok: false, intent, error: "Invalid Telegram user ID" };
        }
        await createTelegramSubscriptionServer(request, {
          telegram_user_id: parsedUserId,
          chat_id: trimmedChatId || undefined,
          chat_label:
            String(formData.get("chat_label") ?? "").trim() || undefined,
          alert_order: formData.get("alert_order") === "on",
          alert_product: formData.get("alert_product") === "on",
        });
        return { ok: true, intent };
      }
      case "accept": {
        const id = String(formData.get("id") ?? "");
        if (!id) return { ok: false, intent, error: "Missing subscription id" };
        await acceptTelegramSubscriptionServer(request, id, {
          alert_order: formData.get("alert_order") === "true",
          alert_product: formData.get("alert_product") === "true",
        });
        return { ok: true, intent };
      }
      case "reject": {
        const id = String(formData.get("id") ?? "");
        if (!id) return { ok: false, intent, error: "Missing subscription id" };
        await rejectTelegramSubscriptionServer(request, id);
        return { ok: true, intent };
      }
      case "delete": {
        const id = String(formData.get("id") ?? "");
        if (!id) return { ok: false, intent, error: "Missing subscription id" };
        await deleteTelegramSubscriptionServer(request, id);
        return { ok: true, intent };
      }
      default:
        return { ok: false, error: "Unknown action" };
    }
  } catch (err) {
    return {
      ok: false,
      intent,
      error: err instanceof Error ? err.message : "Request failed",
    };
  }
}

export default function Telegram() {
  const { notify } = useNotify();
  const { t, formatDateTime } = useI18n();
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<TelegramActionData>();

  const subscriptions = loaderData.subscriptions;
  const settings = loaderData.settings;
  const loadError = loaderData.error
    ? mapLoadError(loaderData.error, t("telegram.authNotConfigured"))
    : null;

  const [activeTab, setActiveTab] = useState<TelegramSubscriptionStatus | "all">(
    "all"
  );
  const [userId, setUserId] = useState("");
  const [chatId, setChatId] = useState("");
  const [chatLabel, setChatLabel] = useState("");
  const [newAlertOrder, setNewAlertOrder] = useState(true);
  const [newAlertProduct, setNewAlertProduct] = useState(true);

  // Alert flags an operator picks before accepting a pending row; both default on.
  const [pendingAlerts, setPendingAlerts] = useState<
    Record<string, TelegramAlertFlags>
  >({});

  const busy =
    fetcher.state !== "idle" &&
    fetcher.formData != null;
  const busyId = busy ? String(fetcher.formData?.get("id") ?? "") : null;
  const adding =
    busy && String(fetcher.formData?.get("intent") ?? "") === "create";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const data = fetcher.data;
    if (!data.ok) {
      notify(data.error ?? t("telegram.failedToLoad"), "error");
      return;
    }
    switch (data.intent) {
      case "create":
        setUserId("");
        setChatId("");
        setChatLabel("");
        notify(t("telegram.subscriptionAdded"));
        break;
      case "accept":
        notify(t("telegram.subscriptionAccepted"));
        break;
      case "reject":
        notify(t("telegram.subscriptionRejected"));
        break;
      case "delete":
        notify(t("telegram.subscriptionDeleted"));
        break;
    }
  }, [fetcher.state, fetcher.data, notify, t]);

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

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUserId = userId.trim();
    const trimmedChatId = chatId.trim();
    if (!trimmedUserId && !trimmedChatId) {
      notify(t("telegram.needUserIdOrChatId"), "error");
      return;
    }
    if (trimmedUserId && !Number.isSafeInteger(Number(trimmedUserId))) {
      notify(t("telegram.invalidUserId"), "error");
      return;
    }
    const fd = new FormData();
    fd.set("intent", "create");
    fd.set("telegram_user_id", trimmedUserId);
    fd.set("chat_id", trimmedChatId);
    fd.set("chat_label", chatLabel.trim());
    if (newAlertOrder) fd.set("alert_order", "on");
    if (newAlertProduct) fd.set("alert_product", "on");
    fetcher.submit(fd, { method: "post" });
  }

  function handleAccept(sub: TelegramSubscription) {
    const alerts = alertsFor(sub);
    const fd = new FormData();
    fd.set("intent", "accept");
    fd.set("id", sub.id);
    fd.set("alert_order", String(alerts.alert_order));
    fd.set("alert_product", String(alerts.alert_product));
    fetcher.submit(fd, { method: "post" });
  }

  function handleReject(sub: TelegramSubscription) {
    const fd = new FormData();
    fd.set("intent", "reject");
    fd.set("id", sub.id);
    fetcher.submit(fd, { method: "post" });
  }

  function handleDelete(sub: TelegramSubscription) {
    if (!window.confirm(t("telegram.confirmDelete"))) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("id", sub.id);
    fetcher.submit(fd, { method: "post" });
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

      {loadError && (
        <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          {loadError}
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
        {subscriptions.length === 0 && !loadError ? (
          <div className="px-5 py-16 text-center">
            <p className="text-faint">{t("telegram.noSubscriptions")}</p>
            <p className="mt-1 text-sm text-soft">
              {t("telegram.noSubscriptionsHint")}
            </p>
          </div>
        ) : filtered.length === 0 && !loadError ? (
          <div className="px-5 py-16 text-center text-faint">
            {t("telegram.noSubscriptionsInStatus")}
          </div>
        ) : filtered.length > 0 ? (
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
        ) : null}
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
