import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { jobs, jobCancelRequests, auditLogs } from "@/db/schema";
import { v4ContractorSuspensions } from "@/db/schema/v4ContractorSuspension";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";
import { appendSystemMessageByJobId } from "@/src/services/v4/v4MessageService";
import { getAdminJobDetail } from "@/src/services/adminV4/jobsReadService";

const BodySchema = z.object({
  confirmText: z.string(),
});

const SUSPENSION_DAYS = 7;

/**
 * POST /api/admin/v4/jobs/[id]/suspend-contractor
 *
 * Suspends the contractor for 7 days when:
 *   - Contractor cancelled within the 8-hour penalty window
 *
 * Backend enforces the action matrix — this route rejects if the scenario
 * does not meet the suspension condition (contractor+inWindow only).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id: jobId } = await ctx.params;
  const now = new Date();

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success || parsed.data.confirmText !== "SUSPEND") {
    return err(400, "ADMIN_V4_CONFIRM_REQUIRED", "Please type SUSPEND to confirm");
  }

  // Load job
  const jobRows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      contractorUserId: jobs.contractor_user_id,
      jobPosterUserId: jobs.job_poster_user_id,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const job = jobRows[0] ?? null;
  if (!job) return err(404, "ADMIN_V4_JOB_NOT_FOUND", "Job not found");

  if (String(job.status ?? "") !== "CANCELLED") {
    return err(409, "ADMIN_V4_SUSPEND_INVALID_STATUS", "Job must be CANCELLED before suspending the contractor");
  }

  if (!job.contractorUserId) {
    return err(409, "ADMIN_V4_NO_CONTRACTOR", "No contractor assigned to this job");
  }

  // Load approved cancel request
  const cancelRows = await db
    .select({
      id: jobCancelRequests.id,
      status: jobCancelRequests.status,
      requestedByRole: jobCancelRequests.requestedByRole,
      withinPenaltyWindow: jobCancelRequests.withinPenaltyWindow,
      supportTicketId: jobCancelRequests.supportTicketId,
      suspensionProcessedAt: jobCancelRequests.suspensionProcessedAt,
      refundProcessedAt: jobCancelRequests.refundProcessedAt,
    })
    .from(jobCancelRequests)
    .where(
      and(
        eq(jobCancelRequests.jobId, jobId),
        inArray(jobCancelRequests.status, ["approved", "refunded"]),
      ),
    )
    .orderBy(jobCancelRequests.createdAt)
    .limit(1);

  const cancelRequest = cancelRows[0] ?? null;
  if (!cancelRequest) {
    return err(409, "ADMIN_V4_NO_CANCEL_REQUEST", "No cancel request found for this job. Use Cancel Job first.");
  }

  // Backend action matrix enforcement — suspension only for contractor+inWindow
  const contractorInWindow =
    String(cancelRequest.requestedByRole ?? "") === "CONTRACTOR" &&
    Boolean(cancelRequest.withinPenaltyWindow);

  if (!contractorInWindow) {
    return err(
      409,
      "ADMIN_V4_SUSPENSION_NOT_APPLICABLE",
      "Contractor suspension only applies when the Contractor cancelled within the 8-hour penalty window",
    );
  }

  if (cancelRequest.suspensionProcessedAt) {
    return err(409, "ADMIN_V4_SUSPENSION_ALREADY_PROCESSED", "Suspension has already been applied for this cancellation");
  }

  const suspendedUntil = new Date(now.getTime() + SUSPENSION_DAYS * 24 * 60 * 60 * 1000);
  const suspensionReason = `Cancelled within 8h penalty window for job ${jobId}`;

  // Determine if we should resolve the support ticket now
  // For contractor-in-window: requires refund + suspension both done
  const shouldResolveTicket = Boolean(cancelRequest.refundProcessedAt);

  try {
    await db.transaction(async (tx) => {
      // Upsert contractor suspension (overwrite if exists — takes latest)
      await tx
        .insert(v4ContractorSuspensions)
        .values({
          contractorUserId: job.contractorUserId!,
          suspendedUntil,
          reason: suspensionReason,
        })
        .onConflictDoUpdate({
          target: v4ContractorSuspensions.contractorUserId,
          set: {
            suspendedUntil,
            reason: suspensionReason,
          },
        });

      // Mark suspension as processed
      await tx
        .update(jobCancelRequests)
        .set({
          suspensionProcessedAt: now,
          resolvedAt: shouldResolveTicket ? now : undefined,
        })
        .where(eq(jobCancelRequests.id, cancelRequest.id));

      // Resolve support ticket if refund was already done
      if (shouldResolveTicket) {
        if (cancelRequest.supportTicketId) {
          await tx
            .update(v4SupportTickets)
            .set({ status: "RESOLVED", updatedAt: now })
            .where(eq(v4SupportTickets.id, cancelRequest.supportTicketId));
        } else {
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
      }

      // Audit log — non-blocking
      try {
        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorUserId: null,
          actorAdminUserId: authed.adminId as any,
          action: "CONTRACTOR_SUSPENDED",
          entityType: "Job",
          entityId: jobId,
          metadata: {
            jobId,
            cancelRequestId: cancelRequest.id,
            contractorUserId: job.contractorUserId,
            suspendedUntil: suspendedUntil.toISOString(),
            reason: suspensionReason,
            adminId: authed.adminId,
            adminEmail: authed.email,
            suspendedAt: now.toISOString(),
          } as any,
        });
      } catch (auditErr) {
        console.error("[CANCEL_CONTRACTOR_SUSPEND] Audit log insert failed (non-fatal)", {
          jobId,
          message: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }
    });

    // Append idempotent system message when suspension completes the resolution
    if (shouldResolveTicket) {
      await appendSystemMessageByJobId(
        jobId,
        "The Contractor cancelled this job within the 8-hour scheduled window. The Job Poster will receive a full refund. The contractor account has been suspended for 7 days.",
        `cancel_resolution_${jobId}_contractor_in_window`,
      ).catch(() => null);
    }

    // Emit resolution event if fully resolved
    if (shouldResolveTicket) {
      await emitDomainEvent(
        {
          type: "JOB_ASSIGNED_CANCELLATION_RESOLVED",
          payload: {
            jobId,
            jobPosterId: String(job.jobPosterUserId ?? ""),
            contractorId: String(job.contractorUserId ?? ""),
            cancelledBy: "CONTRACTOR",
            withinPenaltyWindow: true,
            resolutionType: "FULL_REFUND_WITH_CONTRACTOR_SUSPENSION",
            refundAmountCents: 0,
            payoutAmountCents: 0,
            suspensionApplied: true,
            adminId: authed.adminId,
            dedupeKey: `assigned_cancel_resolved_${cancelRequest.id}`,
          },
        },
        { mode: "best_effort" },
      );
    }

    const refreshed = await getAdminJobDetail(jobId);
    return ok({
      success: true,
      jobId,
      contractorUserId: job.contractorUserId,
      suspendedUntil: suspendedUntil.toISOString(),
      ticketResolved: shouldResolveTicket,
      cancelRequest: refreshed?.cancelRequest ?? null,
    });
  } catch (error) {
    console.error("[ADMIN_V4_SUSPEND_CONTRACTOR_ERROR]", {
      jobId,
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_SUSPEND_CONTRACTOR_FAILED", "Failed to suspend contractor");
  }
}
