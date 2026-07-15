import { DEFAULT_LOCALE, isLocale, } from "~/lib/i18n/types";
export const LOCALE_COOKIE = "dupli1_locale";
const LOCALE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year
export function getLocaleFromCookieHeader(cookieHeader) {
    if (!cookieHeader)
        return DEFAULT_LOCALE;
    for (const part of cookieHeader.split(";")) {
        const [name, ...valueParts] = part.trim().split("=");
        if (name === LOCALE_COOKIE) {
            const value = decodeURIComponent(valueParts.join("="));
            if (isLocale(value))
                return value;
        }
    }
    return DEFAULT_LOCALE;
}
export function getLocaleFromRequest(request) {
    return getLocaleFromCookieHeader(request.headers.get("Cookie"));
}
/** Client-readable cookie (not HttpOnly) so the UI can switch languages. */
export function setLocaleCookie(locale) {
    if (typeof document === "undefined")
        return;
    const secure = typeof window !== "undefined" && window.location.protocol === "https:"
        ? "; Secure"
        : "";
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=${LOCALE_MAX_AGE}; SameSite=Lax${secure}`;
}
export function readLocaleCookieClient() {
    if (typeof document === "undefined")
        return DEFAULT_LOCALE;
    return getLocaleFromCookieHeader(document.cookie);
}
