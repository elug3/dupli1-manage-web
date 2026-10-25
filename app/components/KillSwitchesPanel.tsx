import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import {
  KILL_SWITCH_TEXT_MAX,
  type KillSwitch,
  type PaymentMethodStatus,
} from "~/lib/api";
import { useI18n } from "~/lib/i18n";
import { useNotify } from "~/lib/notifications";

/**
 * The payment kill switches (backend docs/payment-kill-switches.md), shown in
 * a section of /settings. Data comes from the settings loader and changes go
 * through its action (`intent=kill-switch`), with the operator's own token.
 */

export type KillSwitchesData = {
  switches: KillSwitch[];
  methods: PaymentMethodStatus[] | null;
  /** `forbidden` when the operator lacks payment.killswitch.read. */
  error: "forbidden" | string | null;
};

export type KillSwitchActionData = {
  ok: boolean;
  intent: "kill-switch";
  engaged?: boolean;
  error?: string;
};

/** Where the settings action lives; the fetchers post there by name. */
const ACTION = "/settings";

const inputCls =
  "w-full rounded-xl border border-edge bg-panel px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20";

export function KillSwitchesPanel({ switches, methods, error }: KillSwitchesData) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          {error === "forbidden" ? t("killSwitches.forbiddenRead") : error}
        </div>
      )}
      {switches.map((sw) => (
        <SwitchCard
          key={sw.key}
          sw={sw}
          method={
            sw.kind === "payment_method"
              ? methods?.find((m) => m.method === sw.target)
              : undefined
          }
        />
      ))}
    </div>
  );
}

function SwitchCard({
  sw,
  method,
}: {
  sw: KillSwitch;
  method: PaymentMethodStatus | undefined;
}) {
  const { t, formatDateTime } = useI18n();
  const { notify } = useNotify();
  const fetcher = useFetcher<KillSwitchActionData>();
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const busy = fetcher.state !== "idle";
  const label = switchLabel(sw, t);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const data = fetcher.data;
    if (!data.ok) {
      notify(
        data.error === "forbidden"
          ? t("killSwitches.forbiddenManage")
          : (data.error ?? t("killSwitches.failed")),
        "error"
      );
      return;
    }
    setMessage("");
    setReason("");
    notify(
      data.engaged
        ? t("killSwitches.engagedToast", { name: label })
        : t("killSwitches.releasedToast", { name: label })
    );
  }, [fetcher.state, fetcher.data, notify, t, label]);

  function submit(engaged: boolean) {
    const confirmText = engaged
      ? t("killSwitches.confirmEngage", { name: label })
      : t("killSwitches.confirmRelease", { name: label });
    if (!window.confirm(confirmText)) return;
    const fd = new FormData();
    fd.set("intent", "kill-switch");
    fd.set("key", sw.key);
    fd.set("engaged", String(engaged));
    fd.set("message", message);
    fd.set("reason", reason);
    fetcher.submit(fd, { method: "post", action: ACTION });
  }

  const notConfigured = method?.configured === false;

  return (
    <section className="rounded-xl border border-edge p-5" aria-labelledby={`ks-${sw.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`ks-${sw.key}`} className="text-base font-semibold text-ink">
            {label}
          </h2>
          <p className="mt-0.5 font-mono text-xs text-faint">{sw.key}</p>
        </div>
        <StatePill engaged={sw.engaged} />
      </div>

      {notConfigured && (
        <p className="mt-3 rounded-xl bg-warn-bg px-4 py-2.5 text-xs text-warn-fg">
          {t("killSwitches.notConfigured")}
        </p>
      )}

      {sw.engaged ? (
        <div className="mt-4 space-y-3">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
                {t("killSwitches.shopperMessage")}
              </dt>
              <dd className="mt-1 text-ink">
                {sw.message || (
                  <span className="text-muted">
                    {t("killSwitches.defaultMessageInUse")}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
                {t("killSwitches.reason")}
              </dt>
              <dd className="mt-1 text-ink">{sw.reason || "—"}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[16rem] flex-1 text-xs font-medium text-muted">
              {t("killSwitches.releaseNote")}
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={KILL_SWITCH_TEXT_MAX}
                className={`${inputCls} mt-1`}
                placeholder={t("killSwitches.releaseNotePlaceholder")}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => submit(false)}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
            >
              {t("killSwitches.release", { name: label })}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted">
            {t("killSwitches.shopperMessage")}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={KILL_SWITCH_TEXT_MAX}
              rows={3}
              className={`${inputCls} mt-1`}
              placeholder={t("killSwitches.shopperMessagePlaceholder")}
            />
            <span className="mt-1 block text-[11px] text-faint">
              {t("killSwitches.shopperMessageHint")}
            </span>
          </label>
          <label className="text-xs font-medium text-muted">
            {t("killSwitches.reason")}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={KILL_SWITCH_TEXT_MAX}
              rows={3}
              className={`${inputCls} mt-1`}
              placeholder={t("killSwitches.reasonPlaceholder")}
            />
            <span className="mt-1 block text-[11px] text-faint">
              {t("killSwitches.reasonHint")}
            </span>
          </label>
          <div className="sm:col-span-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => submit(true)}
              className="rounded-xl bg-danger-fg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {t("killSwitches.engage", { name: label })}
            </button>
          </div>
        </div>
      )}

      {sw.updated_at && (
        <p className="mt-4 border-t border-edge-soft pt-3 text-xs text-muted">
          {t(sw.engaged ? "killSwitches.engagedBy" : "killSwitches.releasedBy", {
            who: sw.updated_by || "—",
            when: formatDateTime(sw.updated_at),
          })}
        </p>
      )}
    </section>
  );
}

function StatePill({ engaged }: { engaged: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        engaged ? "bg-danger-bg text-danger-fg" : "bg-success-bg text-success-fg",
      ].join(" ")}
    >
      <span
        className={[
          "h-1.5 w-1.5 rounded-full",
          engaged ? "bg-red-500" : "bg-emerald-500",
        ].join(" ")}
      />
      {engaged ? t("killSwitches.stateBlocked") : t("killSwitches.stateOn")}
    </span>
  );
}

type T = ReturnType<typeof useI18n>["t"];

/** A switch the console has no copy for still shows, under its key. */
function switchLabel(sw: KillSwitch, t: T): string {
  if (sw.kind === "payment_method") {
    switch (sw.target) {
      case "credit_card":
        return t("killSwitches.methodCreditCard");
      case "bypass":
        return t("killSwitches.methodBypass");
    }
  }
  return sw.key;
}
