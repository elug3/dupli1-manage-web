import { authedFetch } from "./auth";
import { orderPath, productPath } from "./gateway";
import type { Promotion, PromotionBenefit, PromotionInput } from "./api";
import { expiresOnFromISO } from "./promotions";

/**
 * Secret referral codes (backend docs/product-referral-codes.md, Linear SER-105).
 *
 * A referral code is a promotional code with `kind: "referral"`, a referrer
 * written on it by name (not an account), and a commission rate. Shoppers type
 * it in the ordinary code box and the storefront never says it is a referral,
 * so nothing here writes a description or terms: those are shown to shoppers.
 * One shopper may use it on any number of orders; the discount is on the goods
 * only and has no ₩ cap.
 *
 * Order pays commission on fulfilled orders by KST month, with 3.3% withheld,
 * through `GET /api/v1/orders/reports/referrals?month=YYYY-MM`.
 */

export const DEFAULT_COMMISSION_PERCENT = "5";
export const REFERRER_NAME_MAX = 80;

export type ReferralCode = Promotion & { kind: "referral" };

export function isReferralCode(p: Promotion): p is ReferralCode {
  return p.kind === "referral";
}

export interface ReferralFormState {
  code: string;
  referrerName: string;
  discountType: "percent" | "fixed";
  /** Whole percent, 1–99. */
  percent: string;
  /** Whole KRW. */
  fixedWon: string;
  /** Percent of the goods after the discount, up to two decimals (5, 2.5). */
  commissionPercent: string;
  /** `yyyy-mm-dd`, end of that day in Seoul. Empty = never expires. */
  expiresOn: string;
  active: boolean;
}

export function emptyReferralForm(): ReferralFormState {
  return {
    code: "",
    referrerName: "",
    discountType: "percent",
    percent: "15",
    fixedWon: "",
    commissionPercent: DEFAULT_COMMISSION_PERCENT,
    expiresOn: "",
    active: true,
  };
}

/** 500 → "5", 250 → "2.5". */
export function bpsToPercentText(bps: number | undefined): string {
  if (!bps) return "0";
  return String(Number((bps / 100).toFixed(2)));
}

export function referralToForm(p: Promotion): ReferralFormState {
  const form = emptyReferralForm();
  form.code = p.code;
  form.referrerName = p.referrer_name ?? "";
  if (p.benefit?.discount_type === "fixed") {
    form.discountType = "fixed";
    form.fixedWon = String(p.benefit.discount_fixed_won ?? "");
    form.percent = "";
  } else {
    form.discountType = "percent";
    form.percent = p.benefit?.discount_fraction
      ? String(Math.round(p.benefit.discount_fraction * 100))
      : "";
  }
  form.commissionPercent = bpsToPercentText(p.commission_bps);
  form.expiresOn = expiresOnFromISO(p.expires_at);
  form.active = p.active;
  return form;
}

export interface ReferralBuildResult {
  input?: PromotionInput;
  /** i18n key of the first problem found. */
  errorKey?: string;
}

/**
 * The create or update body, or the first problem. Mirrors the service's
 * checks so a manager sees them under the form. `kind` and `scope` go only on
 * create: the kind of a code cannot change.
 */
export function buildReferralInput(
  form: ReferralFormState,
  options: { create: boolean }
): ReferralBuildResult {
  const code = form.code.trim().toUpperCase();
  if (options.create && !code) return { errorKey: "referrals.errCode" };
  if (options.create && !/^[A-Z0-9_-]+$/.test(code)) return { errorKey: "referrals.errCodeChars" };

  const name = form.referrerName.trim();
  if (!name) return { errorKey: "referrals.errReferrer" };
  if ([...name].length > REFERRER_NAME_MAX) return { errorKey: "referrals.errReferrerLong" };

  const benefit: PromotionBenefit = {
    target: "goods",
    discount_type: form.discountType,
    apply_to: "entire_subtotal",
  };
  if (form.discountType === "percent") {
    const percent = Number(form.percent);
    if (!Number.isInteger(percent) || percent <= 0 || percent >= 100) {
      return { errorKey: "referrals.errPercent" };
    }
    benefit.discount_fraction = percent / 100;
  } else {
    const won = Number(form.fixedWon);
    if (!Number.isInteger(won) || won <= 0) return { errorKey: "referrals.errFixed" };
    benefit.discount_fixed_won = won;
  }

  const commission = Number(form.commissionPercent);
  const bps = Math.round(commission * 100);
  if (
    form.commissionPercent.trim() === "" ||
    !Number.isFinite(commission) ||
    commission < 0 ||
    commission > 100 ||
    Math.abs(commission * 100 - bps) > 1e-6
  ) {
    return { errorKey: "referrals.errCommission" };
  }

  const input: PromotionInput = {
    referrer_name: name,
    commission_bps: bps,
    benefit,
    // Every promotion's rules; a referral code applies to any cart.
    conditions: { version: 0 },
    expires_on: form.expiresOn.trim(),
    active: form.active,
  };
  if (options.create) {
    input.code = code;
    input.kind = "referral";
    input.scope = "global";
  }
  return { input };
}

// ── Monthly commission report ────────────────────────────────────────────────

export interface ReferralLine {
  order_id: string;
  customer_id: string;
  code: string;
  status: string;
  paid_at?: string;
  fulfilled_at?: string;
  /** Code history only: when a canceled order was canceled (refunded). */
  canceled_at?: string;
  subtotal_won: number;
  discount_won: number;
  points_won: number;
  base_won: number;
  commission_bps: number;
  commission_won: number;
}

export interface ReferrerStatement {
  referrer_name: string;
  codes: string[];
  orders: number;
  base_won: number;
  commission_won: number;
  income_tax_won: number;
  local_tax_won: number;
  withholding_won: number;
  net_won: number;
  lines: ReferralLine[];
  open_orders: number;
  open_commission_won: number;
  open: ReferralLine[];
}

export interface ReferralReport {
  month: string;
  from: string;
  to: string;
  timezone: string;
  withholding_bps: number;
  referrers: ReferrerStatement[];
  totals: {
    orders: number;
    base_won: number;
    commission_won: number;
    withholding_won: number;
    net_won: number;
    open_orders: number;
    open_commission_won: number;
  };
}

/** One code's commission for a KST month: its orders fulfilled that month. */
export interface ReferralCodeMonth {
  month: string;
  orders: number;
  base_won: number;
  commission_won: number;
  income_tax_won: number;
  local_tax_won: number;
  withholding_won: number;
  net_won: number;
}

/** `GET /api/v1/orders/reports/referrals/codes/{code}`. */
export interface ReferralCodeHistory {
  code: string;
  /** Names snapshotted on its orders, in order of first use. */
  referrer_names: string[];
  timezone: string;
  withholding_bps: number;
  summary: {
    /** Every paid order, canceled ones too. */
    orders: number;
    fulfilled_orders: number;
    open_orders: number;
    canceled_orders: number;
    /** Distinct shoppers among the orders not canceled. */
    customers: number;
    /** Goods before the discount, and the discount, over the orders not canceled. */
    subtotal_won: number;
    discount_won: number;
    base_won: number;
    commission_won: number;
    open_commission_won: number;
  };
  /** Months with fulfilled orders, newest first. */
  months: ReferralCodeMonth[];
  /** Every paid order, newest payment first. */
  orders: ReferralLine[];
}

export type ReferralOrderFilter = "all" | "fulfilled" | "open" | "canceled";

export const REFERRAL_OPEN_STATUSES = ["paid", "confirmed", "in_transit", "delivered", "disputed"];

export function referralOrderKind(status: string): Exclude<ReferralOrderFilter, "all"> | null {
  if (status === "fulfilled") return "fulfilled";
  if (status === "canceled") return "canceled";
  return REFERRAL_OPEN_STATUSES.includes(status) ? "open" : null;
}

export function filterReferralOrders(lines: ReferralLine[], filter: ReferralOrderFilter): ReferralLine[] {
  return filter === "all" ? lines : lines.filter((l) => referralOrderKind(l.status) === filter);
}

export function isReferralOrderFilter(value: string | null): value is ReferralOrderFilter {
  return value === "all" || value === "fulfilled" || value === "open" || value === "canceled";
}

/** The console path of a code's detail page. */
export function referralCodePath(code: string): string {
  return `/referrals/${encodeURIComponent(code)}`;
}

export class ReferralError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function errorFrom(res: Response, fallback: string): Promise<ReferralError> {
  let message = fallback;
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    message = body.error || body.message || fallback;
  } catch {
    // keep the fallback
  }
  return new ReferralError(message, res.status);
}

/** Every referral code, by code. A `403` means the account lacks `promotion.read`. */
export async function listReferralCodes(): Promise<ReferralCode[]> {
  const res = await authedFetch(productPath("/api/v1/products/promotions"));
  if (!res.ok) throw await errorFrom(res, "Failed to load referral codes");
  const data = (await res.json()) as { results?: Promotion[] };
  return (data.results ?? [])
    .filter(isReferralCode)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function createReferralCode(input: PromotionInput): Promise<ReferralCode> {
  const res = await authedFetch(productPath("/api/v1/products/promotions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await errorFrom(res, "Failed to create the referral code");
  return (await res.json()) as ReferralCode;
}

export async function updateReferralCode(code: string, input: PromotionInput): Promise<ReferralCode> {
  const res = await authedFetch(
    productPath(`/api/v1/products/promotions/by-code/${encodeURIComponent(code)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) throw await errorFrom(res, "Failed to save the referral code");
  return (await res.json()) as ReferralCode;
}

/** The month's statements. A `403` means the account lacks `order.read.all`. */
export async function getReferralReport(month: string): Promise<ReferralReport> {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  const res = await authedFetch(orderPath(`/api/v1/orders/reports/referrals${q}`));
  if (!res.ok) throw await errorFrom(res, "Failed to load the commission report");
  return (await res.json()) as ReferralReport;
}

/** One code's paid orders and monthly commission. A `403` means the account lacks `order.read.all`. */
export async function getReferralCodeHistory(code: string): Promise<ReferralCodeHistory> {
  const res = await authedFetch(
    orderPath(`/api/v1/orders/reports/referrals/codes/${encodeURIComponent(code)}`)
  );
  if (!res.ok) throw await errorFrom(res, "Failed to load the code's orders");
  return (await res.json()) as ReferralCodeHistory;
}

/** The current month in Seoul, `YYYY-MM`. */
export function currentMonthKST(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** `YYYY-MM` shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function isMonth(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * One row per fulfilled order of the month, then a total row per referrer
 * with the withholding and the net to transfer. For paying by hand.
 */
export function referralReportCsv(report: ReferralReport): string {
  const rows: (string | number)[][] = [
    [
      "month", "referrer", "order_id", "code", "fulfilled_at", "subtotal_won",
      "discount_won", "base_won", "commission_bps", "commission_won",
      "income_tax_won", "local_tax_won", "withholding_won", "net_won",
    ],
  ];
  for (const s of report.referrers) {
    for (const l of s.lines) {
      rows.push([
        report.month, s.referrer_name, l.order_id, l.code, l.fulfilled_at ?? "",
        l.subtotal_won, l.discount_won, l.base_won, l.commission_bps, l.commission_won,
        "", "", "", "",
      ]);
    }
    if (s.orders > 0) {
      rows.push([
        report.month, s.referrer_name, "TOTAL", s.codes.join(" "), "",
        "", "", s.base_won, "", s.commission_won,
        s.income_tax_won, s.local_tax_won, s.withholding_won, s.net_won,
      ]);
    }
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

/**
 * Every paid order of one code: what it sold and what it earns. Canceled
 * orders earn nothing and open ones only once they are fulfilled, so the
 * `earns` column says which.
 */
export function referralCodeOrdersCsv(history: ReferralCodeHistory): string {
  const rows: (string | number)[][] = [
    [
      "code", "order_id", "customer_id", "status", "paid_at", "fulfilled_at", "canceled_at",
      "subtotal_won", "discount_won", "base_won", "commission_bps", "commission_won", "earns",
    ],
  ];
  for (const l of history.orders) {
    const kind = referralOrderKind(l.status);
    rows.push([
      history.code, l.order_id, l.customer_id, l.status, l.paid_at ?? "", l.fulfilled_at ?? "",
      l.canceled_at ?? "", l.subtotal_won, l.discount_won, l.base_won, l.commission_bps,
      kind === "canceled" ? 0 : l.commission_won,
      kind === "fulfilled" ? "earned" : kind === "canceled" ? "no" : "when fulfilled",
    ]);
  }
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
