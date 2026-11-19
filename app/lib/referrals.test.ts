import { describe, expect, it } from "vitest";
import type { Promotion } from "./api";
import {
  bpsToPercentText,
  buildReferralInput,
  currentMonthKST,
  emptyReferralForm,
  isMonth,
  type ReferralReport,
  referralReportCsv,
  referralToForm,
  shiftMonth,
} from "./referrals";

const filled = () => ({ ...emptyReferralForm(), code: "huh15", referrerName: " 허경호 " });

describe("buildReferralInput", () => {
  it("creates a global referral code with the default 5% commission", () => {
    const { input, errorKey } = buildReferralInput(filled(), { create: true });
    expect(errorKey).toBeUndefined();
    expect(input).toMatchObject({
      code: "HUH15",
      kind: "referral",
      scope: "global",
      referrer_name: "허경호",
      commission_bps: 500,
      benefit: { target: "goods", discount_type: "percent", discount_fraction: 0.15 },
      active: true,
    });
    // Nothing shown to shoppers is written.
    expect(input).not.toHaveProperty("description");
    expect(input).not.toHaveProperty("terms");
    expect(input?.benefit).not.toHaveProperty("max_discount_won");
  });

  it("never sends kind or scope on an update", () => {
    const { input } = buildReferralInput(filled(), { create: false });
    expect(input).not.toHaveProperty("kind");
    expect(input).not.toHaveProperty("scope");
    expect(input).not.toHaveProperty("code");
  });

  it("takes a fractional commission and a fixed discount", () => {
    const form = { ...filled(), commissionPercent: "2.5", discountType: "fixed" as const, fixedWon: "30000" };
    const { input } = buildReferralInput(form, { create: true });
    expect(input?.commission_bps).toBe(250);
    expect(input?.benefit).toMatchObject({ discount_type: "fixed", discount_fixed_won: 30000 });
  });

  it.each([
    [{ referrerName: "  " }, "referrals.errReferrer"],
    [{ code: "" }, "referrals.errCode"],
    [{ code: "HU H" }, "referrals.errCodeChars"],
    [{ percent: "100" }, "referrals.errPercent"],
    [{ percent: "7.5" }, "referrals.errPercent"],
    [{ commissionPercent: "101" }, "referrals.errCommission"],
    [{ commissionPercent: "1.234" }, "referrals.errCommission"],
    [{ commissionPercent: "" }, "referrals.errCommission"],
    [{ referrerName: "가".repeat(81) }, "referrals.errReferrerLong"],
  ])("refuses %o", (over, key) => {
    expect(buildReferralInput({ ...filled(), ...over }, { create: true }).errorKey).toBe(key);
  });
});

describe("referralToForm", () => {
  it("reads a stored code back", () => {
    const p = {
      code: "HUH15",
      scope: "global",
      kind: "referral",
      referrer_name: "허경호",
      commission_bps: 250,
      active: false,
      benefit: { target: "goods", discount_type: "percent", discount_fraction: 0.15 },
      conditions: { version: 0 },
      expires_at: "2026-12-31T14:59:59.999Z",
    } as unknown as Promotion;
    expect(referralToForm(p)).toMatchObject({
      code: "HUH15",
      referrerName: "허경호",
      percent: "15",
      commissionPercent: "2.5",
      expiresOn: "2026-12-31",
      active: false,
    });
  });
});

describe("months", () => {
  it("shifts across years and validates", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    // 2026-11-30 20:00 UTC is already December in Seoul.
    expect(currentMonthKST(new Date("2026-11-30T20:00:00Z"))).toBe("2026-12");
    expect(bpsToPercentText(500)).toBe("5");
  });
});

describe("referralReportCsv", () => {
  it("writes each order and a total per referrer", () => {
    const report: ReferralReport = {
      month: "2026-11", from: "2026-11-01", to: "2026-11-30", timezone: "Asia/Seoul", withholding_bps: 330,
      referrers: [{
        referrer_name: "허경호", codes: ["HUH15"], orders: 1, base_won: 850000, commission_won: 42500,
        income_tax_won: 1270, local_tax_won: 120, withholding_won: 1390, net_won: 41110,
        lines: [{
          order_id: "ord-1", customer_id: "c1", code: "HUH15", status: "fulfilled",
          fulfilled_at: "2026-11-02T00:00:00Z", subtotal_won: 1000000, discount_won: 150000,
          points_won: 0, base_won: 850000, commission_bps: 500, commission_won: 42500,
        }],
        open_orders: 0, open_commission_won: 0, open: [],
      }],
      totals: { orders: 1, base_won: 850000, commission_won: 42500, withholding_won: 1390, net_won: 41110, open_orders: 0, open_commission_won: 0 },
    };
    const lines = referralReportCsv(report).replace(/^\uFEFF/, "").trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("ord-1");
    expect(lines[2]).toBe("2026-11,허경호,TOTAL,HUH15,,,,850000,,42500,1270,120,1390,41110");
  });
});
