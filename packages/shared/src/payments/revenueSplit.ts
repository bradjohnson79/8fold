/**
 * Non-negotiable marketplace revenue split — Phase 1 model (effective 2026-03).
 *
 * Urban jobs:   Contractor 80% / Router 8% / Platform 12%
 * Regional jobs: Contractor 85% / Router 8% / Platform 7% + $20 flat routing fee to platform
 *
 * - Applies to labor totals only (materials handled via escrow/reimbursement; not split).
 * - The $20 regional routing fee is NEVER included in percentage calculations; it goes
 *   directly to platform after splitting.
 * - All payout math must reference getRevenueSplit() or these constants — no hardcoding.
 *
 * Rounding rule: Math.floor(base * rate), contractor first, router second, platform absorbs remainder.
 *
 * Sanity checks:
 *   Urban  $1,000 → contractor $800 / router $80 / platform $120
 *   Regional $1,000 → contractor $850 / router $80 / platform $70 + $20 = $90 / Stripe charge $1,020
 */

export const REVENUE_SPLIT = {
  contractor: 0.80,
  router: 0.08,
  platform: 0.12,
} as const;

export const REVENUE_SPLIT_REGIONAL = {
  contractor: 0.85,
  router: 0.08,
  platform: 0.07,
  regionalFlatFeeCents: 2000,
} as const;

/**
 * Returns the correct split rates for the job type.
 * Use this in all services instead of hardcoding percentages.
 */
export function getRevenueSplit(isRegional: boolean): {
  contractor: number;
  router: number;
  platform: number;
} {
  return isRegional
    ? { contractor: 0.85, router: 0.08, platform: 0.07 }
    : { contractor: 0.80, router: 0.08, platform: 0.12 };
}
