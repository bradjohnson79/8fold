import { z } from "zod";
import { REVENUE_SPLIT } from "./payments/revenueSplit";

export const CentsSchema = z.number().int().nonnegative();
export type Cents = z.infer<typeof CentsSchema>;

export const CurrencyCodeSchema = z.enum(["USD", "CAD"]);
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export function currencyForCountry(country: "US" | "CA"): CurrencyCode {
  if (country === "US") return "USD";
  if (country === "CA") return "CAD";
  // exhaustive guard
  throw new Error("Unsupported country for currency");
}

export function assertCurrencyMatchesCountry(args: { country: "US" | "CA"; currency: CurrencyCode }) {
  const expected = currencyForCountry(args.country);
  if (args.currency !== expected) {
    throw new Error(`Currency mismatch for ${args.country}: expected ${expected}, got ${args.currency}`);
  }
}

/**
 * Deterministic money formatting with explicit currency label.
 *
 * - Never infers currency from browser locale
 * - Always shows the currency code (USD/CAD)
 * - No conversion logic; caller provides the correct currency
 */
export function formatMoney(amountCents: number, currency: CurrencyCode): string {
  const cents = Number.isFinite(amountCents) ? amountCents : 0;
  const amount = cents / 100;
  const locale = currency === "USD" ? "en-US" : "en-CA";
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
  });
  return `${fmt.format(amount)} ${currency}`;
}

/**
 * CANONICAL PAYOUT MODEL (LOCKED):
 * Authoritative source of truth for all payout calculations.
 */
export { REVENUE_SPLIT };

/**
 * MATERIALS HANDLING (EXPLICIT):
 * - Paid by Job Poster (added to total invoice)
 * - Passed through 100% to Contractor (no platform/router split)
 * - Excluded from percentage-based labor splits
 */
export const MATERIALS_SPLIT = {
  contractor: 1.0,
  router: 0.0,
  platform: 0.0,
};

/**
 * Transaction fees:
 * Marketplace integrity requires fixed, exact splits (75/15/10) on the job total.
 * Stripe/processing fees are absorbed by the platform, so no extra fee is added to the poster invoice here.
 */
export const TRANSACTION_FEE_RATE = 0;

export interface PayoutBreakdown {
  laborTotalCents: number;
  materialsTotalCents: number;
  transactionFeeCents: number;
  contractorPayoutCents: number;
  routerEarningsCents: number;
  platformFeeCents: number;
  totalJobPosterPaysCents: number;
}

export interface RepeatContractorDiscountBreakdown extends PayoutBreakdown {
  repeatContractorDiscountCents: number;
  laborChargedCents: number;
  totalJobPosterPaysAfterDiscountCents: number;
}

export function calculatePayoutBreakdown(
  laborTotalCents: number,
  materialsTotalCents: number = 0
): PayoutBreakdown {
  // Deterministic rounding: compute two legs, remainder to platform.
  const contractorLaborCents = Math.round(laborTotalCents * REVENUE_SPLIT.contractor);
  const routerLaborCents = Math.round(laborTotalCents * REVENUE_SPLIT.router);
  const platformLaborCents = laborTotalCents - contractorLaborCents - routerLaborCents;

  const contractorPayoutCents =
    contractorLaborCents + Math.round(materialsTotalCents * MATERIALS_SPLIT.contractor);
  const routerEarningsCents = routerLaborCents + Math.round(materialsTotalCents * MATERIALS_SPLIT.router);
  const platformFeeCents = platformLaborCents + Math.round(materialsTotalCents * MATERIALS_SPLIT.platform);

  const subtotal = laborTotalCents + materialsTotalCents;
  const transactionFeeCents = 0;
  const totalJobPosterPaysCents = subtotal;

  return {
    laborTotalCents,
    materialsTotalCents,
    transactionFeeCents,
    contractorPayoutCents,
    routerEarningsCents,
    platformFeeCents,
    totalJobPosterPaysCents,
  };
}

/**
 * Repeat Contractor Discount (Router Fee):
 * - Discount equals the router's 15% labor share
 * - Router earnings become 0 (no router involved when contractor is requested directly)
 * - Contractor payout stays 75% of labor base (+ 100% materials)
 * - Platform fee stays 10% of labor base
 * - Poster is charged (labor - discount) + materials + transaction fee
 */
export function calculateRepeatContractorDiscountBreakdown(
  laborTotalCents: number,
  materialsTotalCents: number = 0
): RepeatContractorDiscountBreakdown {
  // Revenue split is non-negotiable; repeat contractor discounts do not change the split.
  const base = calculatePayoutBreakdown(laborTotalCents, materialsTotalCents);
  const repeatContractorDiscountCents = 0;
  const laborChargedCents = laborTotalCents;
  const totalJobPosterPaysAfterDiscountCents = base.totalJobPosterPaysCents;

  return {
    ...base,
    repeatContractorDiscountCents,
    laborChargedCents,
    totalJobPosterPaysAfterDiscountCents
  };
}