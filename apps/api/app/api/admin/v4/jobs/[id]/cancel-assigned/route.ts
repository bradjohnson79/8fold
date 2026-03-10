import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs, jobCancelRequests, auditLogs } from "@/db/schema";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getAdminJobDetail } from "@/src/services/adminV4/jobsReadService";

/**
 * POST /api/admin/v4/jobs/[id]/cancel-assigned
 *
 * Confirms the job cancellation for an assigned job awaiting resolution.
 * Sets job.status = CANCELLED and marks the cancel request as approved.
 *
 * Does NOT resolve the support ticket — that happens only after all financial
 * and suspension actions for this scenario are complete.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id: jobId } = await ctx.params;
  const now = new Date();

  // Load job
  const jobRows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      cancelRequestPending: jobs.cancel_request_pending,
      jobPosterUserId: jobs.job_poster_user_id,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const job = jobRows[0] ?? null;
  if (!job) return err(404, "ADMIN_V4_JOB_NOT_FOUND", "Job not found");

  if (String(job.status ?? "") !== "ASSIGNED_CANCEL_PENDING") {
    return err(409, "ADMIN_V4_CANCEL_ASSIGNED_INVALID_STATUS", `Job must be in ASSIGNED_CANCEL_PENDING status. Current: ${job.status}`);
  }

  // Load the pending cancel request
  const cancelRows = await db
    .select({
      id: jobCancelRequests.id,
      status: jobCancelRequests.status,
      jobPosterId: jobCancelRequests.jobPosterId,
      requestedByRole: jobCancelRequests.requestedByRole,
      withinPenaltyWindow: jobCancelRequests.withinPenaltyWindow,
      supportTicketId: jobCancelRequests.supportTicketId,
    })
    .from(jobCancelRequests)
    .where(and(eq(jobCancelRequests.jobId, jobId), eq(jobCancelRequests.status, "pending")))
    .orderBy(jobCancelRequests.createdAt)
    .limit(1);

  const cancelRequest = cancelRows[0] ?? null;
  if (!cancelRequest) {
    return err(409, "ADMIN_V4_NO_PENDING_CANCEL_REQUEST", "No pending cancel request found for this job");
  }

  try {
    await db.transaction(async (tx) => {
      // Cancel the job — support ticket stays OPEN until financial actions complete
      await tx
        .update(jobs)
        .set({
          status: "CANCELLED" as any,
          cancel_request_pending: false,
          archived: true,
          updated_at: now,
        })
        .where(eq(jobs.id, jobId));

      // Approve the cancel request
      await tx
        .update(jobCancelRequests)
        .set({
          status: "approved",
          reviewedAt: now,
          reviewedByAdminId: authed.adminId,
        })
        .where(eq(jobCancelRequests.id, cancelRequest.id));

      // Audit log
      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: null,
        actorAdminUserId: authed.adminId as any,
        action: "JOB_CANCELLATION_RESOLVED",
        entityType: "Job",
        entityId: jobId,
        metadata: {
          action: "CANCEL_ASSIGNED",
          jobId,
          cancelRequestId: cancelRequest.id,
          requestedByRole: cancelRequest.requestedByRole,
          withinPenaltyWindow: cancelRequest.withinPenaltyWindow,
          adminId: authed.adminId,
          adminEmail: authed.email,
          cancelledAt: now.toISOString(),
        } as any,
      });
    });

    const refreshed = await getAdminJobDetail(jobId);
    return ok({
      success: true,
      jobId,
      cancelRequestId: cancelRequest.id,
      job: refreshed?.job ?? null,
      cancelRequest: refreshed?.cancelRequest ?? null,
    });
  } catch (error) {
    console.error("[ADMIN_V4_CANCEL_ASSIGNED_ERROR]", {
      jobId,
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_CANCEL_ASSIGNED_FAILED", "Failed to cancel assigned job");
  }
}
