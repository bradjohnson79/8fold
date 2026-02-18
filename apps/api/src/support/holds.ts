import { NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { disputeCases } from "../../db/schema/disputeCase";
import { jobHolds } from "../../db/schema/jobHold";

export type DisputeHoldBlock = {
  disputeCaseId?: string;
  ticketId?: string;
};

/**
 * Dispute hold helper (completion gate).
 *
 * Contract:
 * - If a DISPUTE JobHold is ACTIVE for a job, completion / approval endpoints must refuse (409).
 * - This is intentionally independent of `jobs.status` to protect against weird/forced states.
 *
 * Response shape (required by ops workflow):
 * { ok:false, error:"dispute_hold_active", disputeCaseId?: "...", ticketId?: "..." }
 */
export async function requireNoActiveDisputeHold(jobId: string): Promise<NextResponse | null> {
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "invalid_job_id" }, { status: 400 });
  }

  const holdRows = await db
    .select({
      id: jobHolds.id,
      sourceDisputeCaseId: jobHolds.sourceDisputeCaseId,
      createdAt: jobHolds.createdAt,
    })
    .from(jobHolds)
    .where(and(eq(jobHolds.jobId, jobId), eq(jobHolds.status, "ACTIVE" as any), eq(jobHolds.reason, "DISPUTE" as any)))
    .orderBy(desc(jobHolds.createdAt))
    .limit(1);

  const hold = holdRows[0] ?? null;
  if (!hold) return null;

  const disputeCaseId = hold.sourceDisputeCaseId ? String(hold.sourceDisputeCaseId) : undefined;
  const ticketId =
    disputeCaseId && disputeCaseId.length > 0
      ? (
          (
            await db
              .select({ ticketId: disputeCases.ticketId })
              .from(disputeCases)
              .where(eq(disputeCases.id, disputeCaseId))
              .limit(1)
          )[0]?.ticketId ?? undefined
        )
      : undefined;

  return NextResponse.json(
    {
      ok: false,
      error: "dispute_hold_active",
      disputeCaseId,
      ticketId: ticketId ? String(ticketId) : undefined,
    },
    { status: 409 },
  );
}

