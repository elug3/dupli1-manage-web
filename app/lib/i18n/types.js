export const LOCALES = ["en", "ko", "zh-CN"];
export const DEFAULT_LOCALE = "en";
export const LOCALE_LABELS = {
    en: "English",
    ko: "한국어",
    "zh-CN": "简体中文",
};
/** BCP 47 tags for Intl formatters */
export const LOCALE_INTL = {
    en: "en-US",
    ko: "ko-KR",
    "zh-CN": "zh-CN",
};
export function isLocale(value) {
    return LOCALES.includes(value);
}
