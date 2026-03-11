import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs, jobCancelRequests, auditLogs } from "@/db/schema";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";
import { getAdminJobDetail } from "@/src/services/adminV4/jobsReadService";

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
      routingStatus: jobs.routing_status,
      cancelRequestPending: jobs.cancel_request_pending,
      jobPosterUserId: jobs.job_poster_user_id,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const job = jobRows[0] ?? null;
  if (!job) return err(404, "ADMIN_V4_JOB_NOT_FOUND", "Job not found");

  if (!job.cancelRequestPending) {
    return err(409, "ADMIN_V4_NO_CANCEL_REQUEST", "No pending cancellation request on this job");
  }

  // Load the pending cancel request
  const cancelRows = await db
    .select({
      id: jobCancelRequests.id,
      status: jobCancelRequests.status,
      jobPosterId: jobCancelRequests.jobPosterId,
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

  console.log("[CANCEL_APPROVED] Starting approve-cancellation", { jobId, cancelRequestId: cancelRequest.id, adminId: authed.adminId });

  try {
    await db.transaction(async (tx) => {
      // Update job: mark as CANCELLED
      await tx
        .update(jobs)
        .set({
          status: "CANCELLED" as any,
          cancel_request_pending: false,
          archived: true,
          updated_at: now,
        })
        .where(eq(jobs.id, jobId));

      // Update cancel request: approved
      await tx
        .update(jobCancelRequests)
        .set({
          status: "approved",
          reviewedAt: now,
          reviewedByAdminId: authed.adminId,
          resolvedAt: now,
        })
        .where(eq(jobCancelRequests.id, cancelRequest.id));

      // Resolve support ticket if one exists
      if (cancelRequest.supportTicketId) {
        await tx
          .update(v4SupportTickets)
          .set({ status: "RESOLVED", updatedAt: now })
          .where(eq(v4SupportTickets.id, cancelRequest.supportTicketId));
      } else {
        // Fallback: resolve by jobId + category in case ticket ID wasn't stored
        await tx
          .update(v4SupportTickets)
          .set({ status: "RESOLVED", updatedAt: now })
          .where(
            and(
              eq(v4SupportTickets.jobId, jobId),
              eq(v4SupportTickets.category, "PAYMENT_ISSUE"),
              inArray(v4SupportTickets.status, ["OPEN", "IN_PROGRESS"]),
            ),
          );
      }

      // Audit log — non-blocking: a stale FK or schema mismatch must never
      // roll back a legitimate cancellation approval.
      try {
        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorUserId: null,
          actorAdminUserId: authed.adminId as any,
          action: "JOB_CANCELLATION_RESOLVED",
          entityType: "Job",
          entityId: jobId,
          metadata: {
            action: "APPROVE",
            jobId,
            cancelRequestId: cancelRequest.id,
            adminId: authed.adminId,
            adminEmail: authed.email,
            approvedAt: now.toISOString(),
          } as any,
        });
      } catch (auditErr) {
        console.error("[CANCEL_APPROVED] Audit log insert failed (non-fatal)", {
          jobId,
          message: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }
    });

    console.log("[CANCEL_APPROVED] Transaction complete", { jobId });

    // Emit event for notifications (best_effort: outside transaction)
    await emitDomainEvent(
      {
        type: "JOB_CANCELLATION_APPROVED",
        payload: {
          jobId,
          jobPosterId: String(job.jobPosterUserId ?? cancelRequest.jobPosterId ?? ""),
          cancelRequestId: cancelRequest.id,
          adminId: authed.adminId,
          createdAt: now,
          dedupeKey: `job_cancel_approved_${cancelRequest.id}`,
        },
      },
      { mode: "best_effort" },
    );

    const refreshed = await getAdminJobDetail(jobId);
    return ok({
      success: true,
      jobId,
      cancelRequestId: cancelRequest.id,
      job: refreshed?.job ?? null,
      cancelRequest: refreshed?.cancelRequest ?? null,
    });
  } catch (error) {
    console.error("[ADMIN_V4_APPROVE_CANCELLATION_ERROR]", {
      jobId,
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_APPROVE_CANCELLATION_FAILED", "Failed to approve cancellation");
  }
}
