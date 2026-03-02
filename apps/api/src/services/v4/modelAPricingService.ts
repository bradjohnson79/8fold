import { computeEscrowPricing, computeEscrowSplitAllocations } from "@/src/services/escrow/pricing";

export type ModelAPricingInput = {
  appraisalSubtotalCents: number;
  isRegional: boolean;
  country: string;
  province: string | null | undefined;
  percentBps: number;
  fixedCents: number;
};

export type ModelAPricingResult = {
  appraisalSubtotalCents: number;
  regionalFeeCents: number;
  baseSplitCents: number;
  taxRateBps: number;
  taxCents: number;
  estimatedProcessingFeeCents: number;
  totalChargeCents: number;
  contractorPayoutCents: number;
  routerFeeCents: number;
  platformFeeCents: number;
  currency: "USD" | "CAD";
  paymentCurrency: "usd" | "cad";
  province: string | null;
  country: "US" | "CA";
  legacy: {
    laborTotalCents: number;
    priceAdjustmentCents: number;
    transactionFeeCents: number;
    amountCents: number;
  };
};

function toNonNegativeInt(value: unknown): number {
  const parsed = Math.trunc(Number(value ?? 0));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

export function computeEstimatedProcessingFeeCents(input: {
  baseSplitCents: number;
  taxCents: number;
  percentBps: number;
  fixedCents: number;
}): number {
  const baseSplitCents = toNonNegativeInt(input.baseSplitCents);
  const taxCents = toNonNegativeInt(input.taxCents);
  const percentBps = toNonNegativeInt(input.percentBps);
  const fixedCents = toNonNegativeInt(input.fixedCents);
  const percentageComponent = Math.round(((baseSplitCents + taxCents) * percentBps) / 10000);
  return Math.max(0, percentageComponent + fixedCents);
}

export async function computeModelAPricing(input: ModelAPricingInput): Promise<ModelAPricingResult> {
  const escrowPricing = await computeEscrowPricing({
    appraisalSubtotalCents: input.appraisalSubtotalCents,
    isRegional: input.isRegional,
    country: input.country,
    province: input.province,
  });

  const estimatedProcessingFeeCents = computeEstimatedProcessingFeeCents({
    baseSplitCents: escrowPricing.splitBaseCents,
    taxCents: escrowPricing.taxAmountCents,
    percentBps: input.percentBps,
    fixedCents: input.fixedCents,
  });

  const totalChargeCents = escrowPricing.splitBaseCents + escrowPricing.taxAmountCents + estimatedProcessingFeeCents;
  const split = computeEscrowSplitAllocations({
    appraisalSubtotalCents: escrowPricing.appraisalSubtotalCents,
    regionalFeeCents: escrowPricing.regionalFeeCents,
    taxAmountCents: escrowPricing.taxAmountCents,
  });

  return {
    appraisalSubtotalCents: escrowPricing.appraisalSubtotalCents,
    regionalFeeCents: escrowPricing.regionalFeeCents,
    baseSplitCents: escrowPricing.splitBaseCents,
    taxRateBps: escrowPricing.taxRateBps,
    taxCents: escrowPricing.taxAmountCents,
    estimatedProcessingFeeCents,
    totalChargeCents,
    contractorPayoutCents: split.contractorCents,
    routerFeeCents: split.routerCents,
    platformFeeCents: split.platformCents,
    currency: escrowPricing.currency,
    paymentCurrency: escrowPricing.paymentCurrency,
    province: escrowPricing.province,
    country: escrowPricing.country,
    legacy: {
      laborTotalCents: escrowPricing.legacy.laborTotalCents,
      priceAdjustmentCents: escrowPricing.legacy.priceAdjustmentCents,
      transactionFeeCents: estimatedProcessingFeeCents,
      amountCents: totalChargeCents,
    },
  };
}
