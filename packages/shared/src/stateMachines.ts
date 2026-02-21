import { z } from "zod";

/**
 * Explicit state machines
 * - Keep transitions centralized and auditable.
 * - APIs should validate transitions before writing.
 */

export const JobStatusSchema = z.enum([
  "ASSIGNED",
  "IN_PROGRESS",
  "CONTRACTOR_COMPLETED",
  "CUSTOMER_APPROVED",
  "CUSTOMER_REJECTED",
  "COMPLETION_FLAGGED",
  "COMPLETED_APPROVED",
  "DRAFT",
  "PUBLISHED",
  "OPEN_FOR_ROUTING",
  // Legacy/compat status (added to Postgres enum as additive value; treated as terminal).
  "COMPLETED",
  // Dispute hold status (blocks release; treated as terminal until dispute resolution).
  "DISPUTED"
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const PayoutRequestStatusSchema = z.enum([
  "REQUESTED",
  "REJECTED",
  "PAID",
  "CANCELLED"
]);
export type PayoutRequestStatus = z.infer<typeof PayoutRequestStatusSchema>;

export function assertAllowedTransition<TStatus extends string>(
  entityName: string,
  from: TStatus,
  to: TStatus,
  allowed: Readonly<Record<TStatus, readonly TStatus[]>>
): void {
  const ok = allowed[from]?.includes(to) ?? false;
  if (!ok) {
    throw new Error(
      `${entityName} invalid state transition: ${String(from)} -> ${String(to)}`
    );
  }
}

export const JobAllowedTransitions: Readonly<
  Record<JobStatus, readonly JobStatus[]>
> = {
  DRAFT: ["OPEN_FOR_ROUTING", "PUBLISHED"],
  OPEN_FOR_ROUTING: ["ASSIGNED"],
  PUBLISHED: ["ASSIGNED"],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["CONTRACTOR_COMPLETED"],
  CONTRACTOR_COMPLETED: ["CUSTOMER_APPROVED", "CUSTOMER_REJECTED"],
  CUSTOMER_APPROVED: ["COMPLETED_APPROVED", "COMPLETION_FLAGGED"],
  CUSTOMER_REJECTED: ["COMPLETION_FLAGGED"],
  COMPLETION_FLAGGED: ["CUSTOMER_APPROVED", "CUSTOMER_REJECTED", "IN_PROGRESS"],
  COMPLETED_APPROVED: [],
  COMPLETED: [],
  // Disputed jobs are payout-frozen; transitions are handled by dispute resolution workflows.
  DISPUTED: []
} as const;

export const PayoutRequestAllowedTransitions: Readonly<
  Record<PayoutRequestStatus, readonly PayoutRequestStatus[]>
> = {
  REQUESTED: ["PAID", "REJECTED", "CANCELLED"],
  REJECTED: [],
  PAID: [],
  CANCELLED: []
} as const;

