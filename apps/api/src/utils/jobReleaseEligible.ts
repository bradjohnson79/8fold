/**
 * Release eligibility checks for job funds.
 * Used by releaseJobFunds service and tests.
 */
export function isJobDisputedForRelease(job: { status?: string | null }): boolean {
  return String(job.status ?? "") === "DISPUTED";
}
