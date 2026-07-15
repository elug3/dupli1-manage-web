export const LOCALES = ["en", "ko", "zh-CN"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ko: "한국어",
  "zh-CN": "简体中文",
};

/** BCP 47 tags for Intl formatters */
export const LOCALE_INTL: Record<Locale, string> = {
  en: "en-US",
  ko: "ko-KR",
  "zh-CN": "zh-CN",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return LOCALES.includes(value as Locale);
}
