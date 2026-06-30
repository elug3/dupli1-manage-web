import { useState } from "react";

export function meta() {
  return [{ title: "Settings | Schick Admin" }];
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
  storeName: "Schick",
  contactEmail: "admin@schick.co",
  currency: "USD",
  timezone: "America/New_York",
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
  const [site, setSite] = useState<SiteConfig>(defaultSite);
  const [notif, setNotif] = useState<NotifConfig>(defaultNotif);
  const [savingSite, setSavingSite] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);
  const [siteSuccess, setSiteSuccess] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState(false);

  async function saveSite(e: React.FormEvent) {
    e.preventDefault();
    setSavingSite(true);
    await new Promise((r) => setTimeout(r, 600));
    setSavingSite(false);
    setSiteSuccess(true);
    setTimeout(() => setSiteSuccess(false), 3000);
  }

  async function saveNotif(e: React.FormEvent) {
    e.preventDefault();
    setSavingNotif(true);
    await new Promise((r) => setTimeout(r, 500));
    setSavingNotif(false);
    setNotifSuccess(true);
    setTimeout(() => setNotifSuccess(false), 3000);
  }

  function toggleNotif(key: NotifKey) {
    setNotif((n) => ({ ...n, [key]: !n[key] }));
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[#1C1B1F] sm:text-2xl">Settings</h1>
        <p className="mt-0.5 text-sm text-[#6B6480]">
          Manage your store configuration
        </p>
      </div>

      {/* Site settings */}
      <Section title="General" description="Core store settings and identity.">
        <form onSubmit={saveSite} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Store name">
              <input
                value={site.storeName}
                onChange={(e) =>
                  setSite((s) => ({ ...s, storeName: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Contact email">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency">
              <select
                value={site.currency}
                onChange={(e) =>
                  setSite((s) => ({ ...s, currency: e.target.value }))
                }
                className={inputCls}
              >
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="JPY">JPY — Japanese Yen</option>
              </select>
            </Field>
            <Field label="Timezone">
              <select
                value={site.timezone}
                onChange={(e) =>
                  setSite((s) => ({ ...s, timezone: e.target.value }))
                }
                className={inputCls}
              >
                <option value="America/New_York">
                  America/New_York (ET)
                </option>
                <option value="America/Los_Angeles">
                  America/Los_Angeles (PT)
                </option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Europe/Paris">Europe/Paris (CET)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              </select>
            </Field>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-[#E5E3EE] bg-[#FAFAFA] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[#1C1B1F]">
                Maintenance mode
              </p>
              <p className="text-xs text-[#9D98B3]">
                Displays a maintenance page to customers
              </p>
            </div>
            <Toggle
              enabled={site.maintenanceMode}
              onChange={(v) =>
                setSite((s) => ({ ...s, maintenanceMode: v }))
              }
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={savingSite}
              className="rounded-xl bg-[#6D4AFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60"
            >
              {savingSite ? "Saving…" : "Save changes"}
            </button>
            {siteSuccess && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
                Saved
              </span>
            )}
          </div>
        </form>
      </Section>

      {/* Notifications */}
      <Section
        title="Notifications"
        description="Control which events trigger admin email alerts."
      >
        <form onSubmit={saveNotif} className="space-y-4">
          {(
            [
              {
                key: "newOrder" as NotifKey,
                label: "New order placed",
                desc: "Alert when a customer completes checkout",
              },
              {
                key: "lowStock" as NotifKey,
                label: "Low stock warning",
                desc: "Alert when a product has ≤ 5 units remaining",
              },
              {
                key: "refundRequest" as NotifKey,
                label: "Refund request",
                desc: "Alert when a customer requests a refund",
              },
              {
                key: "newUser" as NotifKey,
                label: "New user registration",
                desc: "Alert on every new customer signup",
              },
              {
                key: "weeklyReport" as NotifKey,
                label: "Weekly summary report",
                desc: "Digest of revenue and orders every Monday",
              },
            ] as const
          ).map(({ key, label, desc }) => (
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

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={savingNotif}
              className="rounded-xl bg-[#6D4AFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5A38E8] disabled:opacity-60"
            >
              {savingNotif ? "Saving…" : "Save preferences"}
            </button>
            {notifSuccess && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
                Saved
              </span>
            )}
          </div>
        </form>
      </Section>

      {/* Danger zone */}
      <Section title="Danger zone" description="Irreversible actions.">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-red-900">
                Clear all product data
              </p>
              <p className="mt-0.5 text-xs text-red-700">
                Permanently deletes all products from the catalog. This cannot
                be undone.
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
              onClick={() => alert("Not implemented in demo.")}
            >
              Clear data
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
