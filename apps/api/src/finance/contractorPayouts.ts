import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../db/schema/auditLog";
import { contractorLedgerEntries } from "../../db/schema/contractorLedgerEntry";
import { contractorPayouts } from "../../db/schema/contractorPayout";
import { contractors } from "../../db/schema/contractor";
import { jobAssignments } from "../../db/schema/jobAssignment";
import { jobs } from "../../db/schema/job";
import { nextBusinessDayUTC, type CountryCode } from "./businessDays";

export async function scheduleContractorPayoutForJob(jobId: string) {
  return await db.transaction(async (tx) => {
    const jobRows = await tx
      .select({
        id: jobs.id,
        status: jobs.status,
        isMock: jobs.is_mock,
        contractorPayoutCents: jobs.contractor_payout_cents,
        paymentReleasedAt: jobs.payment_released_at,
        contractorId: jobAssignments.contractorId,
      })
      .from(jobs)
      .leftJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
      .where(eq(jobs.id, jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
  if (!job) return { kind: "not_found" as const };
  if (job.isMock) return { kind: "mock_job" as const };
  if (!job.contractorId) return { kind: "no_assignment" as const };
  if (!job.contractorPayoutCents || job.contractorPayoutCents <= 0) return { kind: "no_contractor_payout" as const };
  if (!job.paymentReleasedAt) return { kind: "payment_not_released" as const };

  // idempotency: one payout per job (unique constraint)
  const existing = await tx
    .select({ id: contractorPayouts.id })
    .from(contractorPayouts)
    .where(eq(contractorPayouts.jobId, jobId))
    .limit(1);
  if (existing[0]?.id) return { kind: "already_scheduled" as const };

  const contractorRows = await tx
    .select({ id: contractors.id, country: contractors.country })
    .from(contractors)
    .where(eq(contractors.id, job.contractorId))
    .limit(1);
  const contractor = contractorRows[0] ?? null;
  if (!contractor) return { kind: "contractor_missing" as const };

  const country = (contractor.country ?? "US") as CountryCode;
  const scheduledFor = nextBusinessDayUTC(new Date(), country);

  // Idempotency: only one pending earning per job.
  const existingEarning = await tx
    .select({ id: contractorLedgerEntries.id })
    .from(contractorLedgerEntries)
    .where(
      and(
        eq(contractorLedgerEntries.contractorId, contractor.id),
        eq(contractorLedgerEntries.jobId, jobId),
        eq(contractorLedgerEntries.type, "CONTRACTOR_EARNING"),
        eq(contractorLedgerEntries.bucket, "PENDING"),
      ),
    )
    .limit(1);
  if (!existingEarning[0]?.id) {
    await tx.insert(contractorLedgerEntries).values({
      id: crypto.randomUUID(),
      contractorId: contractor.id,
      jobId,
      type: "CONTRACTOR_EARNING",
      bucket: "PENDING",
      amountCents: job.contractorPayoutCents,
      memo: "Contractor earning (scheduled for next business day payout)",
    } as any);
  }

  const payoutRows = await tx
    .insert(contractorPayouts)
    .values({
      id: crypto.randomUUID(),
      contractorId: contractor.id,
      jobId,
      amountCents: job.contractorPayoutCents,
      scheduledFor,
    } as any)
    .onConflictDoNothing({ target: [contractorPayouts.jobId] })
    .returning({ id: contractorPayouts.id, scheduledFor: contractorPayouts.scheduledFor });
  const payout = payoutRows[0] ?? null;
  if (!payout) {
    // race: payout already created in parallel
    return { kind: "already_scheduled" as const };
  }

  await tx.insert(auditLogs).values({
    id: crypto.randomUUID(),
    action: "CONTRACTOR_PAYOUT_SCHEDULED",
    entityType: "Job",
    entityId: jobId,
    metadata: {
      contractorId: contractor.id,
      amountCents: job.contractorPayoutCents,
      scheduledFor: payout.scheduledFor.toISOString(),
    } as any,
  });

  return { kind: "ok" as const, payoutId: payout.id };
  });
}

