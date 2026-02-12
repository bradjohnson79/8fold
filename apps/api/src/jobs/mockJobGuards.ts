import { randomUUID } from "crypto";
import { and, eq, isNotNull, lte, or } from "drizzle-orm";
import { db } from "../../db/drizzle";
import {
  auditLogs,
  jobAssignments,
  jobDispatches,
  jobHolds,
  jobPayments,
  jobPhotos,
  jobs,
  ledgerEntries,
  materialsRequests,
  monitoringEvents,
} from "../../db/schema";

/**
 * Mock Job Invariant Enforcement
 * 
 * RULES:
 * 1. isMock = true → jobSource MUST be "MOCK" or "AI_REGENERATED"
 * 2. jobSource = "MOCK" or "AI_REGENERATED" → isMock MUST be true
 * 3. Mock jobs → publicStatus MUST be "IN_PROGRESS"
 * 4. Mock jobs → CANNOT be claimed, routed, or assigned
 * 5. Mock jobs → CANNOT appear as "Available" or "Open"
 */

export interface MockJobValidationResult {
  valid: boolean;
  errors: string[];
  autoFixed?: boolean;
}

/**
 * Validate that a job's mock-related fields are consistent.
 * Returns validation result with errors if invalid.
 */
export function validateMockJobInvariants(job: {
  isMock: boolean;
  jobSource?: "MOCK" | "REAL" | "AI_REGENERATED" | null;
  publicStatus: "OPEN" | "IN_PROGRESS";
  routerId?: string | null;
  claimedAt?: Date | null;
  routingStatus?: string;
}): MockJobValidationResult {
  const errors: string[] = [];

  // Rule 1: isMock consistency
  if (job.isMock && job.jobSource !== "MOCK" && job.jobSource !== "AI_REGENERATED") {
    errors.push("isMock=true but jobSource is not MOCK/AI_REGENERATED");
  }

  if (!job.isMock && (job.jobSource === "MOCK" || job.jobSource === "AI_REGENERATED")) {
    errors.push("jobSource=MOCK/AI_REGENERATED but isMock=false");
  }

  // Rule 2: Mock jobs must be IN_PROGRESS
  if (job.isMock && job.publicStatus === "OPEN") {
    errors.push("Mock jobs cannot have publicStatus=OPEN");
  }

  // Rule 3: Mock jobs cannot be claimed/routed
  if (job.isMock && job.routerId) {
    errors.push("Mock jobs cannot be assigned to a router");
  }

  if (job.isMock && job.claimedAt) {
    errors.push("Mock jobs cannot have claimedAt set");
  }

  if (job.isMock && job.routingStatus && job.routingStatus !== "UNROUTED") {
    errors.push("Mock jobs must have routingStatus=UNROUTED");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Auto-correct a job's mock-related fields to enforce invariants.
 * Returns the corrected data.
 */
export function enforceMockJobInvariants(data: {
  isMock?: boolean;
  jobSource?: "MOCK" | "REAL" | "AI_REGENERATED";
  publicStatus?: "OPEN" | "IN_PROGRESS";
}): {
  isMock: boolean;
  jobSource: "MOCK" | "REAL" | "AI_REGENERATED";
  publicStatus: "OPEN" | "IN_PROGRESS";
} {
  let isMock = data.isMock ?? false;
  let jobSource: "MOCK" | "REAL" | "AI_REGENERATED" = data.jobSource ?? "REAL";
  let publicStatus: "OPEN" | "IN_PROGRESS" = data.publicStatus ?? "OPEN";

  // Rule 1: Sync isMock and jobSource
  if (isMock && jobSource !== "MOCK" && jobSource !== "AI_REGENERATED") {
    jobSource = "MOCK";
  }

  if ((jobSource === "MOCK" || jobSource === "AI_REGENERATED") && !isMock) {
    isMock = true;
  }

  // Rule 2: Mock jobs → IN_PROGRESS
  if (isMock && publicStatus === "OPEN") {
    publicStatus = "IN_PROGRESS";
  }

  return { isMock, jobSource, publicStatus };
}

/**
 * Middleware: Check if a job can be claimed/routed.
 * Throws if the job is a mock job.
 */
export function assertJobIsClaimable(job: { isMock: boolean; jobSource?: "MOCK" | "REAL" | null }) {
  if (job.isMock || job.jobSource === "MOCK" || (job.jobSource as any) === "AI_REGENERATED") {
    throw Object.assign(
      new Error("Mock jobs cannot be claimed, routed, or assigned"),
      { status: 403 }
    );
  }
}

/**
 * Validation gate: Check if a job has valid pricing.
 * Jobs with $0 totals or missing breakdowns are invalid.
 */
export function validateJobPricing(job: {
  laborTotalCents: number;
  contractorPayoutCents: number;
  routerEarningsCents: number;
  brokerFeeCents: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (job.laborTotalCents <= 0) {
    errors.push("laborTotalCents must be > 0");
  }

  if (job.contractorPayoutCents <= 0) {
    errors.push("contractorPayoutCents must be > 0");
  }

  if (job.routerEarningsCents <= 0) {
    errors.push("routerEarningsCents must be > 0");
  }

  if (job.brokerFeeCents <= 0) {
    errors.push("brokerFeeCents must be > 0");
  }

  // Total should be sum of components
  const total = job.laborTotalCents;
  const sum = job.contractorPayoutCents + job.routerEarningsCents + job.brokerFeeCents;

  // Allow small rounding errors (< $0.10)
  if (Math.abs(total - sum) > 10) {
    errors.push(`Total mismatch: laborTotal=${total} but sum=${sum}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Bulk cleanup: Find and delete invalid mock jobs.
 * Returns count of deleted jobs.
 */
export async function cleanupInvalidMockJobs(
  dbLike: typeof db,
  opts?: { dryRun?: boolean; limit?: number }
): Promise<{ deleted: number; errors: Array<{ jobId: string; reason: string }> }> {
  const limit = opts?.limit ?? 1000;
  const dryRun = opts?.dryRun ?? false;

  // Find mock jobs with invalid states
  const invalidJobs = await dbLike
    .select({
      id: jobs.id,
      isMock: jobs.isMock,
      jobSource: jobs.jobSource,
      publicStatus: jobs.publicStatus,
      routerId: jobs.routerId,
      laborTotalCents: jobs.laborTotalCents,
      contractorPayoutCents: jobs.contractorPayoutCents,
      routerEarningsCents: jobs.routerEarningsCents,
      brokerFeeCents: jobs.brokerFeeCents,
      city: jobs.city,
      regionCode: jobs.regionCode,
    })
    .from(jobs)
    .where(
      or(
        // Mock job with OPEN status
        and(eq(jobs.isMock, true), eq(jobs.publicStatus, "OPEN" as any)),
        // Mock job that's claimed
        and(eq(jobs.isMock, true), isNotNull(jobs.routerId)),
        // Mock job with invalid pricing
        and(eq(jobs.isMock, true), lte(jobs.laborTotalCents, 0)),
        and(eq(jobs.isMock, true), lte(jobs.contractorPayoutCents, 0)),
        and(eq(jobs.isMock, true), lte(jobs.routerEarningsCents, 0)),
        and(eq(jobs.isMock, true), lte(jobs.brokerFeeCents, 0)),
        // Inconsistent isMock/jobSource
        and(eq(jobs.isMock, true), eq(jobs.jobSource, "REAL" as any)),
        and(eq(jobs.isMock, false), eq(jobs.jobSource, "MOCK" as any)),
      ),
    )
    .limit(limit);

  if (dryRun) {
    return {
      deleted: 0,
      errors: invalidJobs.map((j) => ({
        jobId: j.id,
        reason: `DRY RUN: Would delete invalid mock job in ${j.city}, ${j.regionCode}`
      }))
    };
  }

  const errors: Array<{ jobId: string; reason: string }> = [];
  let deleted = 0;

  for (const job of invalidJobs) {
    try {
      await dbLike.transaction(async (tx) => {
        await tx.delete(jobPhotos).where(eq(jobPhotos.jobId, job.id));
        await tx.delete(jobDispatches).where(eq(jobDispatches.jobId, job.id));
        await tx.delete(jobHolds).where(eq(jobHolds.jobId, job.id));
        await tx.delete(jobAssignments).where(eq(jobAssignments.jobId, job.id));
        await tx.delete(jobPayments).where(eq(jobPayments.jobId, job.id));
        await tx.delete(ledgerEntries).where(eq(ledgerEntries.jobId, job.id));
        await tx.delete(materialsRequests).where(eq(materialsRequests.jobId, job.id));
        await tx.delete(monitoringEvents).where(eq(monitoringEvents.jobId, job.id));

        await tx.delete(jobs).where(eq(jobs.id, job.id));

        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorUserId: null,
          action: "MOCK_JOB_CLEANUP_INVALID",
          entityType: "Job",
          entityId: job.id,
          metadata: {
            reason: "invalid_state",
            city: job.city,
            regionCode: job.regionCode,
            isMock: job.isMock,
            jobSource: job.jobSource,
            publicStatus: job.publicStatus,
          } as any,
        });
      });

      deleted++;
    } catch (err) {
      errors.push({
        jobId: job.id,
        reason: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return { deleted, errors };
}
