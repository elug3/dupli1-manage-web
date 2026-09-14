import { LOCALE_INTL, type Locale } from "~/lib/i18n/types";

/** Storefront / admin display currency — Dupli1 is KRW-only. */
export const STORE_CURRENCY = "KRW" as const;

/**
 * Format a major-unit money amount (product `price`, or whole-KRW `*_won` /
 * `shipping_fee_won` fields). Always KRW; the optional `currency` argument is
 * ignored for API stability.
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

/** Format API money fields that are whole KRW won (zero-decimal; never ÷100). */
export function formatWon(
  locale: Locale,
  won: number,
  options?: Intl.NumberFormatOptions
): string {
  return formatCurrency(locale, won, STORE_CURRENCY, options);
}
