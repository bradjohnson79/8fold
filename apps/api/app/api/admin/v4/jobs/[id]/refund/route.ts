import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs, jobCancelRequests, auditLogs } from "@/db/schema";
import { escrows } from "@/db/schema/escrow";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { refundPaymentIntent } from "@/src/payments/stripe";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";
import { getAdminJobDetail } from "@/src/services/adminV4/jobsReadService";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id: jobId } = await ctx.params;
  const now = new Date();

  // Load job with payment fields
  const jobRows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      paymentStatus: jobs.payment_status,
      routingStatus: jobs.routing_status,
      stripePaymentIntentId: jobs.stripe_payment_intent_id,
      jobPosterUserId: jobs.job_poster_user_id,
      amountCents: jobs.amount_cents,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const job = jobRows[0] ?? null;
  if (!job) return err(404, "ADMIN_V4_JOB_NOT_FOUND", "Job not found");

  // Guard: payment must be funded (FUNDS_SECURED or FUNDED)
  const paymentStatus = String(job.paymentStatus ?? "");
  if (paymentStatus !== "FUNDS_SECURED" && paymentStatus !== "FUNDED") {
    return err(
      409,
      "ADMIN_V4_REFUND_NOT_FUNDED",
      `Job payment_status is '${paymentStatus}'. Refund is only allowed when FUNDS_SECURED or FUNDED.`,
    );
  }

  // Guard: already refunded
  if ((paymentStatus as string) === "REFUNDED") {
    return err(409, "ADMIN_V4_ALREADY_REFUNDED", "Job has already been refunded");
  }

  // Guard: stripe PI must exist
  if (!job.stripePaymentIntentId) {
    return err(409, "ADMIN_V4_NO_PAYMENT_INTENT", "Job has no associated Stripe payment intent");
  }

  // Load approved cancel request (must be approved, not yet refunded)
  const cancelRows = await db
    .select({
      id: jobCancelRequests.id,
      status: jobCancelRequests.status,
      jobPosterId: jobCancelRequests.jobPosterId,
      supportTicketId: jobCancelRequests.supportTicketId,
    })
    .from(jobCancelRequests)
    .where(
      and(
        eq(jobCancelRequests.jobId, jobId),
        inArray(jobCancelRequests.status, ["approved", "pending"]),
      ),
    )
    .orderBy(jobCancelRequests.createdAt)
    .limit(1);

  const cancelRequest = cancelRows[0] ?? null;
  if (!cancelRequest) {
    return err(
      409,
      "ADMIN_V4_NO_APPROVED_CANCEL_REQUEST",
      "No approved cancellation request found. Approve cancellation before issuing a refund.",
    );
  }

  // Guard: already refunded at the cancel request level
  if (cancelRequest.status === "refunded") {
    return err(409, "ADMIN_V4_CANCEL_REQUEST_ALREADY_REFUNDED", "Refund has already been issued for this cancellation request");
  }

  // Load escrow
  const escrowRows = await db
    .select({ id: escrows.id, status: escrows.status })
    .from(escrows)
    .where(eq(escrows.jobId, jobId))
    .limit(1);

  const escrow = escrowRows[0] ?? null;

  // Call Stripe refund
  let stripeRefundId: string;
  try {
    const refund = await refundPaymentIntent({
      paymentIntentId: job.stripePaymentIntentId,
      reason: "requested_by_customer",
      idempotencyKey: `admin_refund_${jobId}_${cancelRequest.id}`,
      metadata: {
        jobId,
        cancelRequestId: cancelRequest.id,
        adminId: authed.adminId,
      },
    });
    stripeRefundId = refund.refundId;
  } catch (stripeErr) {
    console.error("[ADMIN_V4_REFUND_STRIPE_ERROR]", {
      jobId,
      message: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
    });
    return err(502, "ADMIN_V4_STRIPE_REFUND_FAILED", "Stripe refund failed. Check Stripe dashboard for details.");
  }

  try {
    await db.transaction(async (tx) => {
      // Update job
      await tx
        .update(jobs)
        .set({
          payment_status: "REFUNDED" as any,
          refunded_at: now,
          status: "CANCELLED" as any,
          cancel_request_pending: false,
          archived: true,
          updated_at: now,
        })
        .where(eq(jobs.id, jobId));

      // Update escrow if it exists
      if (escrow) {
        await tx
          .update(escrows)
          .set({ status: "REFUNDED" as any, updatedAt: now })
          .where(eq(escrows.id, escrow.id));
      }

      // Update cancel request to refunded
      await tx
        .update(jobCancelRequests)
        .set({
          status: "refunded",
          reviewedAt: now,
          reviewedByAdminId: authed.adminId,
          resolvedAt: now,
        })
        .where(eq(jobCancelRequests.id, cancelRequest.id));

      // Resolve support ticket
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

      // Audit log — non-blocking
      try {
        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorUserId: null,
          actorAdminUserId: authed.adminId as any,
          action: "JOB_CANCELLATION_RESOLVED",
          entityType: "Job",
          entityId: jobId,
          metadata: {
            action: "REFUND",
            jobId,
            cancelRequestId: cancelRequest.id,
            stripeRefundId,
            adminId: authed.adminId,
            adminEmail: authed.email,
            amountCents: Number(job.amountCents ?? 0),
            refundedAt: now.toISOString(),
          } as any,
        });
      } catch (auditErr) {
        console.error("[CANCEL_REFUND_EXECUTED] Audit log insert failed (non-fatal)", {
          jobId,
          message: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }
    });

    // Emit REFUND_ISSUED event — existing mapper sends JOB_REFUNDED to job poster + all admins
    await emitDomainEvent(
      {
        type: "REFUND_ISSUED",
        payload: {
          jobId,
          refundId: stripeRefundId,
          jobPosterId: String(job.jobPosterUserId ?? cancelRequest.jobPosterId ?? ""),
          createdAt: now,
          dedupeKeyBase: `refund_issued:${stripeRefundId}`,
          metadata: {
            cancelRequestId: cancelRequest.id,
            adminId: authed.adminId,
            source: "admin_v4_refund",
            stripePaymentIntentId: job.stripePaymentIntentId,
          },
        },
      },
      { mode: "best_effort" },
    );

    const refreshed = await getAdminJobDetail(jobId);
    return ok({
      success: true,
      jobId,
      stripeRefundId,
      cancelRequestId: cancelRequest.id,
      job: refreshed?.job ?? null,
      cancelRequest: refreshed?.cancelRequest ?? null,
    });
  } catch (error) {
    console.error("[ADMIN_V4_REFUND_DB_ERROR]", {
      jobId,
      stripeRefundId,
      message: error instanceof Error ? error.message : String(error),
    });
    return err(
      500,
      "ADMIN_V4_REFUND_DB_FAILED",
      `Stripe refund was issued (${stripeRefundId}) but database update failed. Please reconcile manually.`,
    );
  }
}
