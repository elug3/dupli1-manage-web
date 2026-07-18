import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getLocaleFromCookieHeader,
  getLocaleFromRequest,
  readLocaleCookieClient,
  setLocaleCookie,
  LOCALE_COOKIE,
} from "~/lib/i18n/cookie";
import { en, type Messages } from "~/lib/i18n/messages/en";
import { ko } from "~/lib/i18n/messages/ko";
import { zhCN } from "~/lib/i18n/messages/zh-CN";
import {
  DEFAULT_LOCALE,
  LOCALE_INTL,
  LOCALE_LABELS,
  LOCALES,
  type Locale,
  isLocale,
} from "~/lib/i18n/types";

export type { Locale, Messages };
export {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_INTL,
  LOCALE_LABELS,
  LOCALES,
  getLocaleFromCookieHeader,
  getLocaleFromRequest,
  isLocale,
  readLocaleCookieClient,
  setLocaleCookie,
};

const catalogs: Record<Locale, Messages> = {
  en,
  ko,
  "zh-CN": zhCN,
};

type Vars = Record<string, string | number>;

/** Dot-path into Messages, e.g. "nav.dashboard". */
export type MessageKey = {
  [N in keyof Messages]: {
    [K in keyof Messages[N]]: Messages[N][K] extends string
      ? `${N & string}.${K & string}`
      : never;
  }[keyof Messages[N]];
}[keyof Messages];

function resolvePath(messages: Messages, key: string): string | undefined {
  const [ns, leaf] = key.split(".", 2);
  if (!ns || !leaf) return undefined;
  const section = messages[ns as keyof Messages];
  if (!section || typeof section !== "object") return undefined;
  const value = (section as Record<string, string>)[leaf];
  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name];
    return value == null ? `{${name}}` : String(value);
  });
}

export function translate(
  locale: Locale,
  key: string,
  vars?: Vars
): string {
  const messages = catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
  const count =
    vars && typeof vars.count === "number" ? vars.count : undefined;

  if (count != null) {
    const pluralKey = `${key}_${count === 1 ? "one" : "other"}`;
    const plural = resolvePath(messages, pluralKey);
    if (plural) return interpolate(plural, vars);
    const fallbackPlural = resolvePath(catalogs.en, pluralKey);
    if (fallbackPlural) return interpolate(fallbackPlural, vars);
  }

  const hit =
    resolvePath(messages, key) ?? resolvePath(catalogs.en, key) ?? key;
  return interpolate(hit, vars);
}

/** Storefront / admin display currency — Dupli1 is KRW-only. */
export const STORE_CURRENCY = "KRW" as const;

/**
 * Format a major-unit money amount (product `price`, or order cents / 100).
 * Always KRW; the optional `currency` argument is ignored for API stability.
 */
export function formatCurrency(
  locale: Locale,
  amount: number,
  _currency?: string,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(LOCALE_INTL[locale], {
    style: "currency",
    currency: STORE_CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    ...options,
  }).format(amount);
}

/** Format API `*_cents` fields (cart/order still store price × 100). */
export function formatCents(
  locale: Locale,
  cents: number,
  options?: Intl.NumberFormatOptions
): string {
  return formatCurrency(locale, cents / 100, STORE_CURRENCY, options);
}

export function formatDate(
  locale: Locale,
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) {
    return typeof date === "string" ? date : String(date);
  }
  return value.toLocaleDateString(LOCALE_INTL[locale], options);
}

export function formatDateTime(
  locale: Locale,
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) {
    return typeof date === "string" ? date : String(date);
  }
  return value.toLocaleString(LOCALE_INTL[locale], options);
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey | string, vars?: Vars) => string;
  formatCurrency: (
    amount: number,
    currency?: string,
    options?: Intl.NumberFormatOptions
  ) => string;
  formatCents: (
    cents: number,
    options?: Intl.NumberFormatOptions
  ) => string;
  formatDate: (
    date: Date | string | number,
    options?: Intl.DateTimeFormatOptions
  ) => string;
  formatDateTime: (
    date: Date | string | number,
    options?: Intl.DateTimeFormatOptions
  ) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

let localeListeners = new Set<() => void>();
let clientLocale: Locale | null = null;

function subscribeLocale(listener: () => void) {
  localeListeners.add(listener);
  return () => {
    localeListeners.delete(listener);
  };
}

function getClientLocaleSnapshot(): Locale {
  if (clientLocale) return clientLocale;
  clientLocale = readLocaleCookieClient();
  return clientLocale;
}

function emitLocaleChange(next: Locale) {
  clientLocale = next;
  setLocaleCookie(next);
  if (typeof document !== "undefined") {
    document.documentElement.lang = next === "zh-CN" ? "zh-CN" : next;
  }
  localeListeners.forEach((l) => l());
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const cookieLocale = useSyncExternalStore(
    subscribeLocale,
    getClientLocaleSnapshot,
    () => initialLocale ?? DEFAULT_LOCALE
  );

  const [locale, setLocaleState] = useState<Locale>(
    initialLocale && isLocale(initialLocale) ? initialLocale : cookieLocale
  );

  useEffect(() => {
    setLocaleState(cookieLocale);
  }, [cookieLocale]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang =
        locale === "zh-CN" ? "zh-CN" : locale;
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    setLocaleState(next);
    emitLocaleChange(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    return {
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      formatCurrency: (amount, currency, options) =>
        formatCurrency(locale, amount, currency, options),
      formatCents: (cents, options) => formatCents(locale, cents, options),
      formatDate: (date, options) => formatDate(locale, date, options),
      formatDateTime: (date, options) =>
        formatDateTime(locale, date, options),
    };
  }, [locale, setLocale]);

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

/** Safe for meta() / loaders that may run outside the provider. */
export function tForLocale(
  locale: Locale,
  key: string,
  vars?: Vars
): string {
  return translate(locale, key, vars);
}
