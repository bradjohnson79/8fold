import { beforeEach, describe, expect, test, vi } from "vitest";

const getTaxRateBpsMock = vi.fn();
vi.mock("@/src/services/escrow/taxRate", () => ({
  getTaxRateBps: (...args: any[]) => getTaxRateBpsMock(...args),
}));

import { computeEscrowPricing, computeEscrowSplitAllocations } from "@/src/services/escrow/pricing";

describe("escrow pricing", () => {
  beforeEach(() => {
    getTaxRateBpsMock.mockReset();
  });

  test("computes subtotal + regional + tax with rounding", async () => {
    getTaxRateBpsMock.mockResolvedValue(1250); // 12.50%

    const result = await computeEscrowPricing({
      appraisalSubtotalCents: 12345,
      isRegional: true,
      country: "CA",
      province: "BC",
    });

    expect(result.appraisalSubtotalCents).toBe(12345);
    expect(result.regionalFeeCents).toBe(2000);
    expect(result.splitBaseCents).toBe(14345);
    expect(result.taxRateBps).toBe(1250);
    expect(result.taxAmountCents).toBe(Math.round((14345 * 1250) / 10000));
    expect(result.totalAmountCents).toBe(result.splitBaseCents + result.taxAmountCents);
    expect(result.currency).toBe("CAD");
    expect(result.paymentCurrency).toBe("cad");
  });

  test("split allocation keeps remainder on platform and preserves total", () => {
    const split = computeEscrowSplitAllocations({
      appraisalSubtotalCents: 10001,
      regionalFeeCents: 2000,
      taxAmountCents: 701,
    });

    // New model: percentages apply to appraisalSubtotalCents (10001) only; $20 flat goes to platform.
    // isRegional=true → contractor 85%, router 8%.
    expect(split.splitBaseCents).toBe(12001);
    expect(split.contractorCents).toBe(Math.floor(10001 * 0.85)); // 8500
    expect(split.routerCents).toBe(Math.floor(10001 * 0.08));     // 800
    expect(split.platformCents).toBe(12001 - split.contractorCents - split.routerCents); // 2701 (includes $20 flat)
    expect(split.contractorCents + split.routerCents + split.platformCents + split.taxBucketCents).toBe(split.totalCents);
    expect(split.totalCents).toBe(12702);
  });
});
