import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { jobAssignments } from "@/db/schema/jobAssignment";
import { jobs } from "@/db/schema/job";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("jobs");
  return parts[idx + 1] ?? "";
}

/**
 * POST /api/admin/jobs/:id/unassign
 * Admin-only. Removes contractor from job, reverts status to PUBLISHED.
 * Only allowed when status === ASSIGNED. Does not touch ledger, payouts, or invoice amounts.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const jobId = getIdFromUrl(req);
    if (!jobId) return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 });

    const result = await db.transaction(async (tx: any) => {
      const jobRows = await tx
        .select({
          id: jobs.id,
          status: jobs.status,
          contractorUserId: jobs.contractor_user_id,
          archived: jobs.archived,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      const job = jobRows[0] ?? null;
      if (!job) return { kind: "not_found" as const };
      if (job.archived) return { kind: "archived" as const };

      if (job.status !== "ASSIGNED") {
        return { kind: "invalid_status" as const, status: job.status };
      }

      const assignmentRows = await tx
        .select({ id: jobAssignments.id, contractorId: jobAssignments.contractorId })
        .from(jobAssignments)
        .where(eq(jobAssignments.jobId, jobId))
        .limit(1);
      const assignment = assignmentRows[0] ?? null;
      if (!assignment) {
        return { kind: "no_assignment" as const };
      }

      const previousContractorId = assignment.contractorId;
      const previousContractorUserId = job.contractorUserId;

      await tx.delete(jobAssignments).where(eq(jobAssignments.jobId, jobId));

      await tx
        .update(jobs)
        .set({
          contractor_user_id: null,
          status: "PUBLISHED",
        })
        .where(eq(jobs.id, jobId));

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "ADMIN_UNASSIGN_CONTRACTOR",
        entityType: "Job",
        entityId: jobId,
        metadata: {
          previousContractorId,
          previousContractorUserId: previousContractorUserId ?? null,
          revertedStatus: "PUBLISHED",
        } as any,
      });

      const updatedRows = await tx
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      return { kind: "ok" as const, job: updatedRows[0] };
    });

    if (result.kind === "not_found") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (result.kind === "archived")
      return NextResponse.json({ ok: false, error: "Archived jobs cannot be unassigned" }, { status: 409 });
    if (result.kind === "invalid_status")
      return NextResponse.json(
        { ok: false, error: "Cannot unassign at this stage. Only ASSIGNED jobs can be unassigned." },
        { status: 400 }
      );
    if (result.kind === "no_assignment")
      return NextResponse.json({ ok: false, error: "No contractor assigned to this job" }, { status: 400 });

    return NextResponse.json({ ok: true, data: { job: result.job } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/:id/unassign", { route: "/api/admin/jobs/[id]/unassign", userId: auth.userId });
  }
}
