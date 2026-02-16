/**
 * Refund & Cancellation Policy (v1)
 * 
 * VERSION: v1.0
 * LAST_UPDATED: 2024-01-01
 * 
 * REFUND POLICY:
 * - No automatic refunds in v1
 * - Refunds are admin-only and require manual review
 * - Refunds may be issued for:
 *   - Payment errors (duplicate charges)
 *   - Service not rendered (contractor no-show, job cancelled before assignment)
 *   - Fraud or unauthorized charges
 * 
 * CANCELLATION POLICY:
 * - Job Posters may cancel jobs before assignment
 * - Cancellation after assignment requires admin approval
 * - Cancelled jobs are not automatically refunded
 * 
 * DISPUTE RESOLUTION:
 * - All disputes must be submitted via admin dashboard
 * - Admin reviews on a case-by-case basis
 * - Refunds processed manually via Stripe dashboard
 * 
 * POLICY VERSION TRACKING:
 * - Each job stores the policy version at time of creation
 * - Policy changes do not retroactively apply to existing jobs
 */

export const REFUND_POLICY_VERSION = "v1.0" as const;

export const REFUND_POLICY_TEXT = `
Refund & Cancellation Policy (v1.0)

REFUNDS:
- No automatic refunds
- Admin-only refunds for payment errors, service not rendered, or fraud
- Refunds processed manually via Stripe

CANCELLATIONS:
- Jobs may be cancelled before assignment
- Cancellation after assignment requires admin approval
- Cancelled jobs are not automatically refunded

DISPUTES:
- Submit disputes via admin dashboard
- Admin reviews on case-by-case basis
`.trim();
