import { useEffect, useState } from "react";
import { Link, redirect, useFetcher, useLoaderData } from "react-router";
import type {
  TelegramAlertFlags,
  TelegramSubscription,
  TelegramSubscriptionStatus,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";
import {
  acceptTelegramSubscriptionServer,
  deleteTelegramSubscriptionServer,
  loadTelegramSubscription,
  rejectTelegramSubscriptionServer,
  updateTelegramAlertsServer,
} from "~/lib/server/notification.server";
import type { Route } from "./+types/telegram.$id";

export function meta() {
  return [{ title: "Telegram subscription | Dupli1 Admin" }];
}

export type TelegramDetailLoaderData = {
  subscription: TelegramSubscription | null;
  error: string | null;
};

export type TelegramDetailActionData = {
  ok: boolean;
  intent?: string;
  error?: string;
};

const STATUS_BADGE_CLASS: Record<TelegramSubscriptionStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-slate-100 text-slate-600",
};

const ALERT_KEYS = ["alert_order", "alert_product", "alert_support"] as const;

function alertsFromForm(formData: FormData): TelegramAlertFlags {
  return {
    alert_order: formData.get("alert_order") === "true",
    alert_product: formData.get("alert_product") === "true",
    alert_support: formData.get("alert_support") === "true",
  };
}

export async function loader({
  request,
  params,
}: Route.LoaderArgs): Promise<TelegramDetailLoaderData> {
  try {
    const subscription = await loadTelegramSubscription(request, params.id);
    return { subscription, error: null };
  } catch (err) {
    // A redirect to /login is thrown as a Response; let it through.
    if (err instanceof Response) throw err;
    return {
      subscription: null,
      error:
        err instanceof Error
          ? err.message
          : "Failed to load Telegram subscription",
    };
  }
}

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<TelegramDetailActionData | Response> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const id = params.id;

  try {
    switch (intent) {
      case "update":
        await updateTelegramAlertsServer(request, id, alertsFromForm(formData));
        return { ok: true, intent };
      case "accept":
        await acceptTelegramSubscriptionServer(
          request,
          id,
          alertsFromForm(formData)
        );
        return { ok: true, intent };
      case "reject":
        await rejectTelegramSubscriptionServer(request, id);
        return { ok: true, intent };
      case "delete":
        await deleteTelegramSubscriptionServer(request, id);
        return redirect("/telegram");
      default:
        return { ok: false, error: "Unknown action" };
    }
  } catch (err) {
    if (err instanceof Response) throw err;
    return {
      ok: false,
      intent,
      error: err instanceof Error ? err.message : "Request failed",
    };
  }
}

export default function TelegramSubscriptionDetail() {
  const { notify } = useNotify();
  const { t, formatDateTime } = useI18n();
  const { subscription: sub, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<TelegramDetailActionData>();

  // The toggles start from what the service stored, and follow it again after
  // every save, accept or reject reloads the subscription.
  const [alerts, setAlerts] = useState<TelegramAlertFlags | null>(
    sub ? pickAlerts(sub) : null
  );
  useEffect(() => {
    setAlerts(sub ? pickAlerts(sub) : null);
  }, [sub]);

  const busy = fetcher.state !== "idle";
  const pendingIntent = busy
    ? String(fetcher.formData?.get("intent") ?? "")
    : "";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const data = fetcher.data;
    if (!data.ok) {
      notify(data.error ?? t("telegram.failedToLoad"), "error");
      return;
    }
    switch (data.intent) {
      case "update":
        notify(t("telegram.alertsSaved"));
        break;
      case "accept":
        notify(t("telegram.subscriptionAccepted"));
        break;
      case "reject":
        notify(t("telegram.subscriptionRejected"));
        break;
    }
  }, [fetcher.state, fetcher.data, notify, t]);

  if (!sub || !alerts) {
    return (
      <div className="space-y-4">
        <Link to="/telegram" className="text-sm text-accent hover:underline">
          {t("telegram.backToList")}
        </Link>
        <div className="rounded-2xl border border-edge bg-surface p-10 text-center text-muted">
          {error ?? t("telegram.notFound")}
        </div>
      </div>
    );
  }

  const status = sub.status;
  const statusLabel =
    status === "pending"
      ? t("telegram.statusPending")
      : status === "accepted"
        ? t("telegram.statusAccepted")
        : status === "rejected"
          ? t("telegram.statusRejected")
          : status;
  const changed = ALERT_KEYS.some((key) => alerts[key] !== sub[key]);
  const editable = status !== "rejected";

  const alertLabels: Record<(typeof ALERT_KEYS)[number], string> = {
    alert_order: t("telegram.alertOrders"),
    alert_product: t("telegram.alertProducts"),
    alert_support: t("telegram.alertSupport"),
  };

  function submit(intent: string, withAlerts: boolean) {
    const fd = new FormData();
    fd.set("intent", intent);
    if (withAlerts && alerts) {
      for (const key of ALERT_KEYS) fd.set(key, String(alerts[key]));
    }
    fetcher.submit(fd, { method: "post" });
  }

  function handleDelete() {
    if (!window.confirm(t("telegram.confirmDelete"))) return;
    submit("delete", false);
  }

  const dateOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  } as const;
  const empty = t("common.emptyValue");

  const details: [string, React.ReactNode][] = [
    [t("telegram.fieldChatId"), <Mono key="chat">{sub.chat_id || empty}</Mono>],
    [
      t("telegram.fieldUserId"),
      <Mono key="user">{sub.telegram_user_id ?? empty}</Mono>,
    ],
    [t("telegram.fieldChatType"), sub.chat_type || empty],
    [t("telegram.fieldUsername"), sub.username ? `@${sub.username}` : empty],
    [t("telegram.colRegistered"), formatDateTime(sub.created_at, dateOptions)],
    [t("telegram.fieldUpdated"), formatDateTime(sub.updated_at, dateOptions)],
    [
      t("telegram.fieldAcceptedAt"),
      sub.accepted_at ? formatDateTime(sub.accepted_at, dateOptions) : empty,
    ],
    [
      t("telegram.fieldAcceptedBy"),
      sub.accepted_by ? <Mono key="by">{sub.accepted_by}</Mono> : empty,
    ],
  ];

  return (
    <div className="space-y-6">
      <Link to="/telegram" className="text-sm text-accent hover:underline">
        {t("telegram.backToList")}
      </Link>

      <div className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-ink">
            {sub.chat_label ||
              (sub.username ? `@${sub.username}` : "") ||
              t("telegram.detailTitleFallback")}
          </h1>
          <span
            className={[
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
              STATUS_BADGE_CLASS[status] ?? "bg-slate-100 text-slate-600",
            ].join(" ")}
          >
            {statusLabel}
          </span>
        </div>
        <p className="mt-1 font-mono text-sm text-muted">{sub.id}</p>

        <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-faint">
          {t("telegram.sectionDetails")}
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-0.5 text-sm text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8">
        <h2 className="text-sm font-semibold text-ink">
          {t("telegram.sectionAlerts")}
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          {status === "pending"
            ? t("telegram.alertsPendingHint")
            : status === "rejected"
              ? t("telegram.alertsRejectedHint")
              : t("telegram.alertsHint")}
        </p>

        <div className="mt-4 space-y-3">
          {ALERT_KEYS.map((key) => (
            <label
              key={key}
              htmlFor={`telegram-detail-${key}`}
              className="flex items-center gap-2 text-sm text-ink"
            >
              <input
                id={`telegram-detail-${key}`}
                type="checkbox"
                checked={alerts[key]}
                disabled={!editable || busy}
                onChange={(e) =>
                  setAlerts({ ...alerts, [key]: e.target.checked })
                }
                className="size-4 rounded border-edge text-accent focus:ring-accent/20 disabled:opacity-50"
              />
              {alertLabels[key]}
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {status === "accepted" && (
            <button
              type="button"
              disabled={!changed || busy}
              onClick={() => submit("update", true)}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
            >
              {pendingIntent === "update"
                ? t("common.saving")
                : t("telegram.saveAlerts")}
            </button>
          )}
          {status === "pending" && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => submit("accept", true)}
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
              >
                {t("telegram.accept")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => submit("reject", false)}
                className="rounded-xl border border-edge px-5 py-2.5 text-sm font-semibold text-muted transition hover:bg-page disabled:opacity-60"
              >
                {t("telegram.reject")}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-edge bg-surface p-5 shadow-[0_1px_4px_rgba(28,27,31,0.04)] sm:p-8">
        <h2 className="text-sm font-semibold text-ink">
          {t("telegram.sectionRemove")}
        </h2>
        <p className="mt-0.5 text-xs text-muted">{t("telegram.removeHint")}</p>
        <button
          type="button"
          disabled={busy}
          onClick={handleDelete}
          className="mt-4 rounded-xl border border-edge px-5 py-2.5 text-sm font-semibold text-danger-fg transition hover:border-red-200 disabled:opacity-60"
        >
          {t("telegram.delete")}
        </button>
      </div>
    </div>
  );
}

function pickAlerts(sub: TelegramSubscription): TelegramAlertFlags {
  return {
    alert_order: sub.alert_order,
    alert_product: sub.alert_product,
    // Absent until the notification service reports it.
    alert_support: sub.alert_support ?? false,
  };
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs">{children}</span>;
}
