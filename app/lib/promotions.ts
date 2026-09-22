/**
 * Form logic for promotional code definitions.
 *
 * The wire shapes (`Promotion`, `PromotionBenefit`, `PromotionConditions`) live
 * in `api.ts` next to the calls; this module owns the translation between a
 * definition and the fields a manager edits, plus the client-side checks that
 * mirror the service's write-time validation.
 *
 * The service validates every definition on write and is authoritative — see
 * dupli1 `product/pkg/domain/promotion_{benefit,conditions}.go`. Checking here
 * too only means a manager sees "discount must be between 1 and 99%" under the
 * field instead of as a failed request.
 */
import type {
  ConditionOp,
  Promotion,
  PromotionBenefit,
  PromotionConditions,
  PromotionInput,
  PromotionPredicate,
  PromotionScope,
} from "~/lib/api";

/** How a condition attribute's value is compared. */
export type AttrKind = "number" | "string" | "boolean";

export interface ConditionAttr {
  attr: string;
  kind: AttrKind;
  /** i18n key for the picker label. */
  labelKey: string;
  /** True for `line.*` attributes, which are read per cart line. */
  line: boolean;
}

/**
 * The attributes a predicate may address, mirroring the service's allowlist.
 * A manager cannot reach a field the evaluator does not know how to read, so
 * this list only grows when the backend's does — and every entry here is one
 * the evaluator can actually satisfy. `customer.paid_order_count` was dropped
 * from both on 2026-09-21: only order knows that number, it sends none, and a
 * rule on it was refused on every cart.
 */
export const CONDITION_ATTRS: ConditionAttr[] = [
  { attr: "subtotal_won", kind: "number", labelKey: "promotions.attrSubtotal", line: false },
  { attr: "shipping_fee_won", kind: "number", labelKey: "promotions.attrShippingFee", line: false },
  { attr: "item_count", kind: "number", labelKey: "promotions.attrItemCount", line: false },
  { attr: "line.category", kind: "string", labelKey: "promotions.attrCategory", line: true },
  { attr: "line.brandCode", kind: "string", labelKey: "promotions.attrBrand", line: true },
  { attr: "line.unit_price_won", kind: "number", labelKey: "promotions.attrUnitPrice", line: true },
  { attr: "line.skuId", kind: "string", labelKey: "promotions.attrSkuId", line: true },
  { attr: "line.productId", kind: "string", labelKey: "promotions.attrProductId", line: true },
  { attr: "line.on_sale", kind: "boolean", labelKey: "promotions.attrOnSale", line: true },
];

export function attrKind(attr: string): AttrKind {
  return CONDITION_ATTRS.find((a) => a.attr === attr)?.kind ?? "string";
}

export function isLineAttr(attr: string): boolean {
  return attr.startsWith("line.");
}

const SET_OPS: ConditionOp[] = ["in", "nin"];

/** Ops offered for an attribute. Ordering comparisons need a number. */
export function opsForKind(kind: AttrKind): ConditionOp[] {
  switch (kind) {
    case "number":
      return ["gte", "lte", "gt", "lt", "eq", "neq"];
    case "boolean":
      return ["eq", "neq"];
    default:
      return ["eq", "neq", "in", "nin"];
  }
}

export function isSetOp(op: ConditionOp): boolean {
  return SET_OPS.includes(op);
}

/** One condition row as the form holds it — values are raw text until save. */
export interface ConditionRow {
  attr: string;
  op: ConditionOp;
  value: string;
}

export interface PromotionFormState {
  code: string;
  scope: PromotionScope;
  description: string;
  terms: string;
  discountType: "percent" | "fixed";
  /** Whole percent, 1–99, when discountType is percent. */
  percent: string;
  /** Whole KRW when discountType is fixed. */
  fixedWon: string;
  /** Optional cap on a percentage, whole KRW. */
  maxDiscountWon: string;
  applyTo: "entire_subtotal" | "eligible_lines";
  /** `yyyy-mm-dd`; means the end of that day in Seoul. Empty = never expires. */
  expiresOn: string;
  maxRedemptions: string;
  conditions: ConditionRow[];
  /** Drops on-sale lines from the discount, as an `exclude` predicate. */
  excludeOnSale: boolean;
  lineMatch: "any" | "all";
}

export function emptyPromotionForm(): PromotionFormState {
  return {
    code: "",
    scope: "global",
    description: "",
    terms: "",
    discountType: "percent",
    percent: "",
    fixedWon: "",
    maxDiscountWon: "",
    applyTo: "entire_subtotal",
    expiresOn: "",
    maxRedemptions: "",
    conditions: [],
    excludeOnSale: false,
    lineMatch: "any",
  };
}

/**
 * Excludes lines already marked down. The evaluator reads a line's sale state
 * from the catalog — a parent whose official price stands above its selling
 * price — so this holds without checkout sending anything.
 */
const ON_SALE_EXCLUSION: PromotionPredicate = {
  attr: "line.on_sale",
  op: "eq",
  value: true,
};

function isOnSaleExclusion(p: PromotionPredicate): boolean {
  return p.attr === "line.on_sale" && p.op === "eq" && p.value === true;
}

/** The benefit a definition prices from, falling back to the pre-Phase-2 column. */
export function effectiveBenefit(promotion: Promotion): PromotionBenefit | null {
  const benefit = promotion.benefit;
  if (benefit && (benefit.target || benefit.discount_type)) return benefit;
  if (promotion.discount > 0) {
    return {
      target: "goods",
      discount_type: "percent",
      discount_fraction: promotion.discount,
      apply_to: "entire_subtotal",
    };
  }
  return null;
}

/** Fills the form from an existing definition, for the edit panel. */
export function promotionToForm(promotion: Promotion): PromotionFormState {
  const form = emptyPromotionForm();
  form.code = promotion.code;
  form.scope = promotion.scope || "global";
  form.description = promotion.description ?? "";
  form.terms = promotion.terms ?? "";

  const benefit = effectiveBenefit(promotion);
  if (benefit?.discount_type === "fixed") {
    form.discountType = "fixed";
    form.fixedWon = String(benefit.discount_fixed_won ?? "");
  } else if (benefit) {
    form.discountType = "percent";
    form.percent = benefit.discount_fraction
      ? String(Math.round(benefit.discount_fraction * 100))
      : "";
  }
  if (benefit?.max_discount_won) {
    form.maxDiscountWon = String(benefit.max_discount_won);
  }
  if (benefit?.apply_to === "eligible_lines") form.applyTo = "eligible_lines";

  form.expiresOn = expiresOnFromISO(promotion.expires_at);
  form.maxRedemptions =
    promotion.max_redemptions == null ? "" : String(promotion.max_redemptions);

  const conditions = promotion.conditions;
  if (conditions?.all) {
    form.conditions = conditions.all.map((p) => ({
      attr: p.attr,
      op: p.op,
      value: valueToText(p.value),
    }));
  }
  form.excludeOnSale = (conditions?.exclude ?? []).some(isOnSaleExclusion);
  form.lineMatch = conditions?.line_match === "all" ? "all" : "any";
  return form;
}

/**
 * The Seoul calendar date an expiry instant belongs to.
 *
 * A manager picks a date meaning end-of-day KST, and the service stores the
 * instant; rendering it back in UTC would show the next day for anything past
 * 15:00 UTC, which is every end-of-day expiry there is.
 */
export function expiresOnFromISO(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const seoul = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  return seoul.toISOString().slice(0, 10);
}

function valueToText(value: PromotionPredicate["value"]): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value ?? "");
}

export interface BuildResult {
  input?: PromotionInput;
  /** i18n key of the first problem found, so the page can render the message. */
  errorKey?: string;
}

/**
 * Turns the form into the request body, or names the first problem.
 *
 * Everything it refuses is something the service would refuse too; the point
 * is only that the manager finds out before the round trip.
 */
export function buildPromotionInput(
  form: PromotionFormState,
  options: { includeCode: boolean }
): BuildResult {
  const code = form.code.trim().toUpperCase();
  if (options.includeCode && !code) return { errorKey: "promotions.errCodeRequired" };

  const benefit: PromotionBenefit = {
    target: "goods",
    discount_type: form.discountType,
    apply_to: form.applyTo,
  };

  if (form.discountType === "percent") {
    const percent = Number(form.percent);
    if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
      return { errorKey: "promotions.errPercentRange" };
    }
    benefit.discount_fraction = percent / 100;
  } else {
    const won = Number(form.fixedWon);
    if (!Number.isInteger(won) || won <= 0) {
      return { errorKey: "promotions.errFixedAmount" };
    }
    benefit.discount_fixed_won = won;
  }

  if (form.maxDiscountWon.trim()) {
    const cap = Number(form.maxDiscountWon);
    if (!Number.isInteger(cap) || cap <= 0) return { errorKey: "promotions.errCap" };
    benefit.max_discount_won = cap;
  }

  const all: PromotionPredicate[] = [];
  for (const row of form.conditions) {
    const built = buildPredicate(row);
    if ("errorKey" in built) return { errorKey: built.errorKey };
    all.push(built.predicate);
  }

  const exclude = form.excludeOnSale ? [ON_SALE_EXCLUSION] : [];
  const hasRules = all.length > 0 || exclude.length > 0;
  const conditions: PromotionConditions = hasRules
    ? {
        version: 1,
        ...(all.length ? { all } : {}),
        ...(exclude.length ? { exclude } : {}),
        // Only meaningful once a line predicate exists; sending the default
        // otherwise would suggest a rule the document does not have.
        ...(all.some((p) => isLineAttr(p.attr)) ? { line_match: form.lineMatch } : {}),
      }
    : { version: 0 };

  let maxRedemptions: number | undefined;
  if (form.maxRedemptions.trim()) {
    const cap = Number(form.maxRedemptions);
    if (!Number.isInteger(cap) || cap <= 0) return { errorKey: "promotions.errRedemptionCap" };
    maxRedemptions = cap;
  }

  const input: PromotionInput = {
    scope: form.scope,
    description: form.description.trim(),
    terms: form.terms.trim(),
    benefit,
    conditions,
    // "" clears the expiry; the service reads a date as end-of-day in Seoul.
    expires_on: form.expiresOn.trim(),
  };
  if (options.includeCode) input.code = code;
  if (maxRedemptions !== undefined) input.max_redemptions = maxRedemptions;
  return { input };
}

function buildPredicate(
  row: ConditionRow
): { predicate: PromotionPredicate } | { errorKey: string } {
  const kind = attrKind(row.attr);
  const raw = row.value.trim();
  if (!raw) return { errorKey: "promotions.errConditionValue" };

  if (isSetOp(row.op)) {
    const items = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (items.length === 0) return { errorKey: "promotions.errConditionValue" };
    return {
      predicate: {
        attr: row.attr,
        op: row.op,
        value: kind === "number" ? items.map(Number) : items,
      },
    };
  }

  if (kind === "number") {
    const value = Number(raw);
    if (!Number.isFinite(value)) return { errorKey: "promotions.errConditionNumber" };
    return { predicate: { attr: row.attr, op: row.op, value } };
  }
  if (kind === "boolean") {
    return { predicate: { attr: row.attr, op: row.op, value: raw === "true" } };
  }
  return { predicate: { attr: row.attr, op: row.op, value: raw } };
}

/** True once a definition has been used, so edits need a warning. */
export function isLivePromotion(promotion: Promotion): boolean {
  return (promotion.redemption_count ?? 0) > 0;
}

/** Rules a definition carries, for the list's summary column. */
export function conditionCount(promotion: Promotion): number {
  const conditions = promotion.conditions;
  return (conditions?.all?.length ?? 0) + (conditions?.exclude?.length ?? 0);
}
