import { useState } from "react";
import { useI18n } from "~/lib/i18n";
import { LanguageSwitcher } from "~/lib/i18n/LanguageSwitcher";
import { useNotify } from "~/lib/notifications";
import {
  APP_BUILD_NUMBER,
  APP_VERSION,
  shortGitSha,
} from "~/lib/version";

export function meta() {
  return [{ title: "Settings | Dupli1 Admin" }];
}

type NotifKey =
  | "newOrder"
  | "lowStock"
  | "refundRequest"
  | "newUser"
  | "weeklyReport";

interface SiteConfig {
  storeName: string;
  contactEmail: string;
  currency: string;
  timezone: string;
  maintenanceMode: boolean;
}

interface NotifConfig {
  newOrder: boolean;
  lowStock: boolean;
  refundRequest: boolean;
  newUser: boolean;
  weeklyReport: boolean;
}

const defaultSite: SiteConfig = {
  storeName: "Dupli1",
  contactEmail: "admin@dupli1.co",
  currency: "KRW",
  timezone: "Asia/Seoul",
  maintenanceMode: false,
};

const defaultNotif: NotifConfig = {
  newOrder: true,
  lowStock: true,
  refundRequest: true,
  newUser: false,
  weeklyReport: true,
};

export default function Settings() {
  const { t } = useI18n();
  const { notify } = useNotify();
  const [site, setSite] = useState<SiteConfig>(defaultSite);
  const [notif, setNotif] = useState<NotifConfig>(defaultNotif);
  const [savingSite, setSavingSite] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);

  async function saveSite(e: React.FormEvent) {
    e.preventDefault();
    setSavingSite(true);
    await new Promise((r) => setTimeout(r, 600));
    setSavingSite(false);
    notify(t("settings.settingsSaved"));
  }

  async function saveNotif(e: React.FormEvent) {
    e.preventDefault();
    setSavingNotif(true);
    await new Promise((r) => setTimeout(r, 500));
    setSavingNotif(false);
    notify(t("settings.notificationPrefsSaved"));
  }

  function toggleNotif(key: NotifKey) {
    setNotif((n) => ({ ...n, [key]: !n[key] }));
  }

  const notifItems = [
    {
      key: "newOrder" as NotifKey,
      label: t("settings.notifNewOrder"),
      desc: t("settings.notifNewOrderDesc"),
    },
    {
      key: "lowStock" as NotifKey,
      label: t("settings.notifLowStock"),
      desc: t("settings.notifLowStockDesc"),
    },
    {
      key: "refundRequest" as NotifKey,
      label: t("settings.notifRefundRequest"),
      desc: t("settings.notifRefundRequestDesc"),
    },
    {
      key: "newUser" as NotifKey,
      label: t("settings.notifNewUser"),
      desc: t("settings.notifNewUserDesc"),
    },
    {
      key: "weeklyReport" as NotifKey,
      label: t("settings.notifWeeklyReport"),
      desc: t("settings.notifWeeklyReportDesc"),
    },
  ];

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">
          {t("settings.title")}
        </h1>
        <p className="mt-0.5 text-sm text-[#6B6480]">
          {t("settings.subtitle")}
        </p>
      </div>

      {/* Site settings */}
      <Section
        title={t("settings.sectionGeneral")}
        description={t("settings.sectionGeneralDesc")}
      >
        <form onSubmit={saveSite} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("settings.storeName")}>
              <input
                value={site.storeName}
                onChange={(e) =>
                  setSite((s) => ({ ...s, storeName: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label={t("settings.contactEmail")}>
              <input
                type="email"
                value={site.contactEmail}
                onChange={(e) =>
                  setSite((s) => ({ ...s, contactEmail: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
          </div>

          <div className="space-y-1.5">
            <LanguageSwitcher />
            <p className="text-xs text-[#9D98B3]">
              {t("settings.languageDesc")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("settings.currency")}>
              <input
                value={t("settings.currencyKrwOnly")}
                readOnly
                disabled
                className={`${inputCls} cursor-not-allowed opacity-80`}
              />
            </Field>
            <Field label={t("settings.timezone")}>
              <select
                value={site.timezone}
                onChange={(e) =>
                  setSite((s) => ({ ...s, timezone: e.target.value }))
                }
                className={inputCls}
              >
                <option value="America/New_York">
                  {t("settings.timezoneEt")}
                </option>
                <option value="America/Los_Angeles">
                  {t("settings.timezonePt")}
                </option>
                <option value="Europe/London">{t("settings.timezoneGmt")}</option>
                <option value="Europe/Paris">{t("settings.timezoneCet")}</option>
                <option value="Asia/Tokyo">{t("settings.timezoneJst")}</option>
                <option value="Asia/Seoul">{t("settings.timezoneKst")}</option>
                <option value="Asia/Shanghai">
                  {t("settings.timezoneCst")}
                </option>
              </select>
            </Field>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[#1C1B1F]">
                {t("settings.maintenanceMode")}
              </p>
              <p className="text-xs text-[#9D98B3]">
                {t("settings.maintenanceModeDesc")}
              </p>
            </div>
            <Toggle
              enabled={site.maintenanceMode}
              onChange={(v) =>
                setSite((s) => ({ ...s, maintenanceMode: v }))
              }
            />
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={savingSite}
              className="rounded-xl bg-[#6D4AFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60"
            >
              {savingSite ? t("settings.saving") : t("settings.saveChanges")}
            </button>
          </div>
        </form>
      </Section>

      {/* Notifications */}
      <Section
        title={t("settings.sectionNotifications")}
        description={t("settings.sectionNotificationsDesc")}
      >
        <form onSubmit={saveNotif} className="space-y-4">
          {notifItems.map(({ key, label, desc }) => (
            <div
              key={key}
              className="flex flex-col gap-3 rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-[#1C1B1F]">{label}</p>
                <p className="text-xs text-[#9D98B3]">{desc}</p>
              </div>
              <Toggle
                enabled={notif[key]}
                onChange={() => toggleNotif(key)}
              />
            </div>
          ))}

          <div className="pt-1">
            <button
              type="submit"
              disabled={savingNotif}
              className="rounded-xl bg-[#6D4AFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60"
            >
              {savingNotif
                ? t("settings.saving")
                : t("settings.savePreferences")}
            </button>
          </div>
        </form>
      </Section>

      {/* About / version */}
      <Section
        title={t("settings.sectionAbout")}
        description={t("settings.sectionAboutDesc")}
      >
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
              {t("settings.appVersion")}
            </dt>
            <dd className="mt-1 font-mono text-sm tabular-nums text-[#1C1B1F]">
              {APP_VERSION}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
              {t("settings.buildNumber")}
            </dt>
            <dd className="mt-1 font-mono text-sm tabular-nums text-[#1C1B1F]">
              {APP_BUILD_NUMBER}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
              {t("settings.gitCommit")}
            </dt>
            <dd className="mt-1 font-mono text-sm tabular-nums text-[#1C1B1F]">
              {shortGitSha()}
            </dd>
          </div>
        </dl>
      </Section>

      {/* Danger zone */}
      <Section
        title={t("settings.sectionDanger")}
        description={t("settings.sectionDangerDesc")}
      >
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-red-900">
                {t("settings.clearAllProductData")}
              </p>
              <p className="mt-0.5 text-xs text-red-700">
                {t("settings.clearAllProductDataDesc")}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
              onClick={() => alert(t("settings.notImplementedDemo"))}
            >
              {t("settings.clearData")}
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#E5E3EE] bg-white p-6 shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
      <div className="mb-5 border-b border-[#E5E3EE] pb-4">
        <h2 className="font-bold text-[#1C1B1F]">{title}</h2>
        <p className="mt-0.5 text-xs text-[#9D98B3]">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B6480]">
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
        enabled ? "bg-[#6D4AFF]" : "bg-[#D1CDE6]",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
          enabled ? "translate-x-4" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

const inputCls =
  "w-full rounded-xl border border-[#E5E3EE] bg-[#F8F7FC] px-4 py-2.5 text-sm text-[#1C1B1F] outline-none transition placeholder:text-[#B4B0C8] focus:border-[#6D4AFF] focus:ring-2 focus:ring-[#6D4AFF]/20";
