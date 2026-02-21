export type JobActiveLike = {
  paymentStatus: string | null | undefined;
  status: string | null | undefined;
};

const ACTIVE_STATUSES = ["OPEN_FOR_ROUTING", "ROUTED", "ACCEPTED", "ASSIGNED", "IN_PROGRESS"] as const;

/**
 * Job is ACTIVE when:
 * - paymentStatus is captured/secured (FUNDS_SECURED or legacy FUNDED)
 * - status in ACTIVE_STATUSES
 *
 * NOTE: Current DB enum uses "ASSIGNED" (not "ACCEPTED") and routing is tracked via `routingStatus`.
 * We include prompt-level aliases ("ROUTED", "ACCEPTED") plus runtime statuses ("ASSIGNED") to ensure
 * lifecycle gating matches intended behavior.
 */
export function isJobActive(job: JobActiveLike): boolean {
  const paymentStatus = String(job.paymentStatus ?? "").trim().toUpperCase();
  const status = String(job.status ?? "").trim().toUpperCase();
  return ["FUNDS_SECURED", "FUNDED"].includes(paymentStatus) && (ACTIVE_STATUSES as readonly string[]).includes(status);
}

