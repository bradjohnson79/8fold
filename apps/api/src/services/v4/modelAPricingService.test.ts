import { beforeEach, describe, expect, test, vi } from "vitest";

const computeEscrowPricingMock = vi.fn();
const computeEscrowSplitAllocationsMock = vi.fn();

vi.mock("@/src/services/escrow/pricing", () => ({
  computeEscrowPricing: (...args: any[]) => computeEscrowPricingMock(...args),
  computeEscrowSplitAllocations: (...args: any[]) => computeEscrowSplitAllocationsMock(...args),
}));

import { computeEstimatedProcessingFeeCents, computeModelAPricing } from "@/src/services/v4/modelAPricingService";

describe("modelA pricing", () => {
  beforeEach(() => {
    computeEscrowPricingMock.mockReset();
    computeEscrowSplitAllocationsMock.mockReset();
  });

  test("computes estimated processing fee from base + tax", () => {
    const fee = computeEstimatedProcessingFeeCents({
      baseSplitCents: 100000,
      taxCents: 12000,
      percentBps: 290,
      fixedCents: 30,
    });
    expect(fee).toBe(Math.round((112000 * 290) / 10000) + 30);
  });

  test("returns server-authoritative model A totals and split values", async () => {
    computeEscrowPricingMock.mockResolvedValue({
      appraisalSubtotalCents: 98000,
      regionalFeeCents: 2000,
      splitBaseCents: 100000,
      taxRateBps: 1200,
      taxAmountCents: 12000,
      totalAmountCents: 112000,
      currency: "CAD",
      paymentCurrency: "cad",
      province: "BC",
      country: "CA",
      legacy: {
        laborTotalCents: 98000,
        priceAdjustmentCents: 2000,
        transactionFeeCents: 12000,
        amountCents: 112000,
      },
    });
    computeEscrowSplitAllocationsMock.mockReturnValue({
      contractorCents: 75000,
      routerCents: 15000,
      platformCents: 10000,
      totalCents: 112000,
      splitBaseCents: 100000,
      taxBucketCents: 12000,
    });

    const result = await computeModelAPricing({
      appraisalSubtotalCents: 98000,
      isRegional: true,
      country: "CA",
      province: "BC",
      percentBps: 290,
      fixedCents: 30,
    });

    const estimated = Math.round((112000 * 290) / 10000) + 30;
    expect(result.baseSplitCents).toBe(100000);
    expect(result.taxCents).toBe(12000);
    expect(result.estimatedProcessingFeeCents).toBe(estimated);
    expect(result.totalChargeCents).toBe(112000 + estimated);
    expect(result.contractorPayoutCents).toBe(75000);
    expect(result.routerFeeCents).toBe(15000);
    expect(result.platformFeeCents).toBe(10000);
    expect(result.legacy.transactionFeeCents).toBe(estimated);
    expect(result.legacy.amountCents).toBe(result.totalChargeCents);
  });
});
