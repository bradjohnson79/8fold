import { randomUUID } from "crypto";
import { and, eq, gte, ilike, lte } from "drizzle-orm";
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
} from "../../db/schema";

/**
 * Future-safe removal hooks for MOCK jobs.
 * These functions do NOT auto-run. They are utilities for admin-controlled removal.
 * All deletions are logged and auditable.
 * REAL jobs are NEVER affected.
 */

export interface RemovalResult {
  deleted: number;
  skipped: number;
  errors: Array<{ jobId: string; error: string }>;
}

async function deleteJobCascade(tx: any, jobId: string) {
  await tx.delete(jobPhotos).where(eq(jobPhotos.jobId, jobId));
  await tx.delete(jobDispatches).where(eq(jobDispatches.jobId, jobId));
  await tx.delete(jobHolds).where(eq(jobHolds.jobId, jobId));
  await tx.delete(jobAssignments).where(eq(jobAssignments.jobId, jobId));
  await tx.delete(jobPayments).where(eq(jobPayments.jobId, jobId));
  await tx.delete(ledgerEntries).where(eq(ledgerEntries.jobId, jobId));
  await tx.delete(materialsRequests).where(eq(materialsRequests.jobId, jobId));
  await tx.delete(jobs).where(eq(jobs.id, jobId));
}

async function removeCandidates(
  action: "MOCK_JOB_REMOVED_BY_CITY" | "MOCK_JOB_REMOVED_BY_REGION" | "MOCK_JOB_REMOVED_BY_DATE_RANGE",
  candidates: Array<{ id: string; title: string; city: string | null; regionCode: string | null; createdAt: Date }>,
  opts: { dryRun?: boolean },
): Promise<RemovalResult> {
  if (opts.dryRun) {
    return {
      deleted: 0,
      skipped: 0,
      errors: [],
      ...{ _dryRunCount: candidates.length },
    } as RemovalResult & { _dryRunCount: number };
  }

  const errors: Array<{ jobId: string; error: string }> = [];
  let deleted = 0;

  await db.transaction(async (tx) => {
    for (const job of candidates) {
      try {
        const verify =
          (
            await tx
              .select({ jobSource: jobs.jobSource })
              .from(jobs)
              .where(eq(jobs.id, job.id))
              .limit(1)
          )[0] ?? null;
        if (verify?.jobSource !== "MOCK") continue;

        await deleteJobCascade(tx, job.id);

        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorUserId: null,
          action,
          entityType: "Job",
          entityId: job.id,
          metadata: {
            city: job.city,
            regionCode: job.regionCode,
            title: job.title,
            createdAt: job.createdAt.toISOString(),
            removalReason:
              action === "MOCK_JOB_REMOVED_BY_CITY"
                ? "bulk_removal_by_city"
                : action === "MOCK_JOB_REMOVED_BY_REGION"
                  ? "bulk_removal_by_region"
                  : "bulk_removal_by_date_range",
          } as any,
        });

        deleted++;
      } catch (err) {
        errors.push({ jobId: job.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  });

  return { deleted, skipped: candidates.length - deleted - errors.length, errors };
}

export async function removeMockJobsByCity(opts: {
  city: string;
  regionCode?: string;
  country?: "US" | "CA";
  dryRun?: boolean;
}): Promise<RemovalResult> {
  const candidates = await db
    .select({ id: jobs.id, title: jobs.title, city: jobs.city, regionCode: jobs.regionCode, createdAt: jobs.createdAt })
    .from(jobs)
    .where(
      and(
        eq(jobs.jobSource, "MOCK" as any),
        ilike(jobs.city, opts.city),
        ...(opts.regionCode ? [eq(jobs.regionCode, opts.regionCode.toUpperCase())] : []),
        ...(opts.country ? [eq(jobs.country, opts.country as any)] : []),
      ) as any,
    );
  return removeCandidates("MOCK_JOB_REMOVED_BY_CITY", candidates as any, { dryRun: opts.dryRun });
}

export async function removeMockJobsByRegion(opts: {
  regionCode: string;
  country?: "US" | "CA";
  dryRun?: boolean;
}): Promise<RemovalResult> {
  const candidates = await db
    .select({ id: jobs.id, title: jobs.title, city: jobs.city, regionCode: jobs.regionCode, createdAt: jobs.createdAt })
    .from(jobs)
    .where(
      and(
        eq(jobs.jobSource, "MOCK" as any),
        eq(jobs.regionCode, opts.regionCode.toUpperCase()),
        ...(opts.country ? [eq(jobs.country, opts.country as any)] : []),
      ) as any,
    );
  return removeCandidates("MOCK_JOB_REMOVED_BY_REGION", candidates as any, { dryRun: opts.dryRun });
}

export async function removeMockJobsByDateRange(opts: {
  startDate: Date;
  endDate: Date;
  dryRun?: boolean;
}): Promise<RemovalResult> {
  const candidates = await db
    .select({ id: jobs.id, title: jobs.title, city: jobs.city, regionCode: jobs.regionCode, createdAt: jobs.createdAt })
    .from(jobs)
    .where(and(eq(jobs.jobSource, "MOCK" as any), gte(jobs.createdAt, opts.startDate), lte(jobs.createdAt, opts.endDate)));
  return removeCandidates("MOCK_JOB_REMOVED_BY_DATE_RANGE", candidates as any, { dryRun: opts.dryRun });
}

