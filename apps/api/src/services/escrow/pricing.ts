import { getTaxRateBps } from "@/src/services/escrow/taxRate";
import {
  getPlatformFees,
  REGIONAL_PLATFORM_FLAT_FEE_CENTS,
} from "@/src/config/platformFees";

export type EscrowPricingInput = {
  appraisalSubtotalCents: number;
  isRegional: boolean;
  country: string;
  province: string | null | undefined;
};

export type EscrowPricingResult = {
  appraisalSubtotalCents: number;
  regionalFeeCents: number;
  splitBaseCents: number;
  taxRateBps: number;
  taxAmountCents: number;
  totalAmountCents: number;
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

export type EscrowSplitResult = {
  splitBaseCents: number;
  contractorCents: number;
  routerCents: number;
  platformCents: number;
  taxBucketCents: number;
  totalCents: number;
};

function toCountry(country: string): "US" | "CA" {
  return String(country ?? "").trim().toUpperCase() === "CA" ? "CA" : "US";
}

function toProvince(province: string | null | undefined): string | null {
  const value = String(province ?? "").trim().toUpperCase();
  return value || null;
}

function toPositiveCents(value: unknown): number {
  const asNumber = Number(value ?? 0);
  if (!Number.isFinite(asNumber)) return 0;
  return Math.max(0, Math.trunc(asNumber));
}

export async function computeEscrowPricing(input: EscrowPricingInput): Promise<EscrowPricingResult> {
  const country = toCountry(input.country);
  const province = toProvince(input.province);
  const appraisalSubtotalCents = toPositiveCents(input.appraisalSubtotalCents);
  const regionalFeeCents = input.isRegional ? REGIONAL_PLATFORM_FLAT_FEE_CENTS : 0;
  const splitBaseCents = appraisalSubtotalCents + regionalFeeCents;

  const taxRateBps = await getTaxRateBps({ country, province });
  const taxAmountCents = Math.round((splitBaseCents * taxRateBps) / 10000);
  const totalAmountCents = splitBaseCents + taxAmountCents;

  return {
    appraisalSubtotalCents,
    regionalFeeCents,
    splitBaseCents,
    taxRateBps,
    taxAmountCents,
    totalAmountCents,
    country,
    province,
    currency: country === "CA" ? "CAD" : "USD",
    paymentCurrency: country === "CA" ? "cad" : "usd",
    legacy: {
      laborTotalCents: appraisalSubtotalCents,
      priceAdjustmentCents: regionalFeeCents,
      transactionFeeCents: taxAmountCents,
      amountCents: totalAmountCents,
    },
  };
}

export function computeEscrowSplitAllocations(input: {
  appraisalSubtotalCents: number;
  regionalFeeCents: number;
  taxAmountCents: number;
}): EscrowSplitResult {
  const appraisalSubtotalCents = toPositiveCents(input.appraisalSubtotalCents);
  const regionalFeeCents = toPositiveCents(input.regionalFeeCents);
  const taxBucketCents = toPositiveCents(input.taxAmountCents);

  // splitBaseCents = full amount charged to poster (used for invariant and totalCents).
  // Percentages apply to appraisalSubtotalCents ONLY — the $20 regional fee goes flat to platform.
  const splitBaseCents = appraisalSubtotalCents + regionalFeeCents;
  const isRegional = regionalFeeCents > 0;
  const fees = getPlatformFees(isRegional);

  // Rounding order: contractor first → router second → platform absorbs remainder (including $20 flat).
  const contractorCents = Math.floor(appraisalSubtotalCents * fees.contractor);
  const routerCents = Math.floor(appraisalSubtotalCents * fees.router);
  const platformCents   = splitBaseCents - contractorCents - routerCents;
  const totalCents      = splitBaseCents + taxBucketCents;

  if (contractorCents + routerCents + platformCents + taxBucketCents !== totalCents) {
    throw Object.assign(new Error("Escrow split invariant failed"), { status: 500 });
  }

  return {
    splitBaseCents,
    contractorCents,
    routerCents,
    platformCents,
    taxBucketCents,
    totalCents,
  };
}
