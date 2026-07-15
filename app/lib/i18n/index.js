import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, } from "react";
import { getLocaleFromCookieHeader, getLocaleFromRequest, readLocaleCookieClient, setLocaleCookie, LOCALE_COOKIE, } from "~/lib/i18n/cookie";
import { en } from "~/lib/i18n/messages/en";
import { ko } from "~/lib/i18n/messages/ko";
import { zhCN } from "~/lib/i18n/messages/zh-CN";
import { DEFAULT_LOCALE, LOCALE_INTL, LOCALE_LABELS, LOCALES, isLocale, } from "~/lib/i18n/types";
export { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_INTL, LOCALE_LABELS, LOCALES, getLocaleFromCookieHeader, getLocaleFromRequest, isLocale, readLocaleCookieClient, setLocaleCookie, };
const catalogs = {
    en,
    ko,
    "zh-CN": zhCN,
};
function resolvePath(messages, key) {
    const [ns, leaf] = key.split(".", 2);
    if (!ns || !leaf)
        return undefined;
    const section = messages[ns];
    if (!section || typeof section !== "object")
        return undefined;
    const value = section[leaf];
    return typeof value === "string" ? value : undefined;
}
function interpolate(template, vars) {
    if (!vars)
        return template;
    return template.replace(/\{(\w+)\}/g, (_, name) => {
        const value = vars[name];
        return value == null ? `{${name}}` : String(value);
    });
}
export function translate(locale, key, vars) {
    const messages = catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
    const count = vars && typeof vars.count === "number" ? vars.count : undefined;
    if (count != null) {
        const pluralKey = `${key}_${count === 1 ? "one" : "other"}`;
        const plural = resolvePath(messages, pluralKey);
        if (plural)
            return interpolate(plural, vars);
        const fallbackPlural = resolvePath(catalogs.en, pluralKey);
        if (fallbackPlural)
            return interpolate(fallbackPlural, vars);
    }
    const hit = resolvePath(messages, key) ?? resolvePath(catalogs.en, key) ?? key;
    return interpolate(hit, vars);
}
export function formatCurrency(locale, amount, currency = "USD", options) {
    return new Intl.NumberFormat(LOCALE_INTL[locale], {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        ...options,
    }).format(amount);
}
export function formatDate(locale, date, options) {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) {
        return typeof date === "string" ? date : String(date);
    }
    return value.toLocaleDateString(LOCALE_INTL[locale], options);
}
export function formatDateTime(locale, date, options) {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) {
        return typeof date === "string" ? date : String(date);
    }
    return value.toLocaleString(LOCALE_INTL[locale], options);
}
const I18nContext = createContext(null);
let localeListeners = new Set();
let clientLocale = null;
function subscribeLocale(listener) {
    localeListeners.add(listener);
    return () => {
        localeListeners.delete(listener);
    };
}
function getClientLocaleSnapshot() {
    if (clientLocale)
        return clientLocale;
    clientLocale = readLocaleCookieClient();
    return clientLocale;
}
function emitLocaleChange(next) {
    clientLocale = next;
    setLocaleCookie(next);
    if (typeof document !== "undefined") {
        document.documentElement.lang = next === "zh-CN" ? "zh-CN" : next;
    }
    localeListeners.forEach((l) => l());
}
export function I18nProvider({ children, initialLocale, }) {
    const cookieLocale = useSyncExternalStore(subscribeLocale, getClientLocaleSnapshot, () => initialLocale ?? DEFAULT_LOCALE);
    const [locale, setLocaleState] = useState(initialLocale && isLocale(initialLocale) ? initialLocale : cookieLocale);
    useEffect(() => {
        setLocaleState(cookieLocale);
    }, [cookieLocale]);
    useEffect(() => {
        if (typeof document !== "undefined") {
            document.documentElement.lang =
                locale === "zh-CN" ? "zh-CN" : locale;
        }
    }, [locale]);
    const setLocale = useCallback((next) => {
        if (!isLocale(next))
            return;
        setLocaleState(next);
        emitLocaleChange(next);
    }, []);
    const value = useMemo(() => {
        return {
            locale,
            setLocale,
            t: (key, vars) => translate(locale, key, vars),
            formatCurrency: (amount, currency, options) => formatCurrency(locale, amount, currency, options),
            formatDate: (date, options) => formatDate(locale, date, options),
            formatDateTime: (date, options) => formatDateTime(locale, date, options),
        };
    }, [locale, setLocale]);
    return (_jsx(I18nContext.Provider, { value: value, children: children }));
}
export function useI18n() {
    const ctx = useContext(I18nContext);
    if (!ctx) {
        throw new Error("useI18n must be used within I18nProvider");
    }
    return ctx;
}
/** Safe for meta() / loaders that may run outside the provider. */
export function tForLocale(locale, key, vars) {
    return translate(locale, key, vars);
}
