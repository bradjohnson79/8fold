/**
 * Non-negotiable marketplace revenue split.
 *
 * - Applies to labor totals (materials are handled via escrow/reimbursement and are not split).
 * - Percentages must be constants (no dynamic variation).
 * - All payout math must reference this constant only.
 */
export const REVENUE_SPLIT = {
  contractor: 0.75,
  router: 0.15,
  platform: 0.1,
} as const;

