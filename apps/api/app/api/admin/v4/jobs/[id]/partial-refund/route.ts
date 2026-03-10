import { randomUUID } from "crypto";
import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { jobs, jobCancelRequests, auditLogs } from "@/db/schema";
import { escrows } from "@/db/schema/escrow";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { v4FinancialLedger } from "@/db/schema/v4FinancialLedger";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { refundPaymentIntent } from "@/src/payments/stripe";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";
import { getAdminJobDetail } from "@/src/services/adminV4/jobsReadService";
import { splitByPercent } from "@/src/utils/finance/splitByPercent";
import { appendSystemMessageByJobId } from "@/src/services/v4/v4MessageService";

const BodySchema = z.object({
  confirmText: z.string(),
});

/**
 * POST /api/admin/v4/jobs/[id]/partial-refund
 *
 * Issues a refund for an assigned job cancellation.
 * Backend enforces refund amount based on the cancel request's requestedByRole
 * and withinPenaltyWindow — UI is not the source of truth.
 *
 * - Poster cancelled in window → 75% refund (escrow: PARTIALLY_REFUNDED)
 * - All other scenarios     → 100% refund (escrow: REFUNDED)
 *
 * Resolve support ticket only when:
 * - !posterInWindow (no payout action required), OR
 * - payoutProcessedAt IS NOT NULL (payout already done)
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id: jobId } = await ctx.params;
  const now = new Date();

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success || parsed.data.confirmText !== "REFUND") {
    return err(400, "ADMIN_V4_CONFIRM_REQUIRED", "Please type REFUND to confirm");
  }

  // Load job
  const jobRows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      paymentStatus: jobs.payment_status,
      stripePaymentIntentId: jobs.stripe_payment_intent_id,
      jobPosterUserId: jobs.job_poster_user_id,
      amountCents: jobs.amount_cents,
      paymentCurrency: jobs.payment_currency,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const job = jobRows[0] ?? null;
  if (!job) return err(404, "ADMIN_V4_JOB_NOT_FOUND", "Job not found");

  if (String(job.status ?? "") !== "CANCELLED") {
    return err(409, "ADMIN_V4_PARTIAL_REFUND_INVALID_STATUS", "Job must be CANCELLED before issuing a refund");
  }

  const paymentStatus = String(job.paymentStatus ?? "");
  if (paymentStatus !== "FUNDS_SECURED" && paymentStatus !== "FUNDED") {
    return err(409, "ADMIN_V4_REFUND_NOT_FUNDED", `Payment status is '${paymentStatus}'. Refund requires FUNDS_SECURED or FUNDED.`);
  }

  if (!job.stripePaymentIntentId) {
    return err(409, "ADMIN_V4_NO_PAYMENT_INTENT", "No Stripe payment intent on this job");
  }

  // Load the approved cancel request
  const cancelRows = await db
    .select({
      id: jobCancelRequests.id,
      status: jobCancelRequests.status,
      requestedByRole: jobCancelRequests.requestedByRole,
      withinPenaltyWindow: jobCancelRequests.withinPenaltyWindow,
      supportTicketId: jobCancelRequests.supportTicketId,
      refundProcessedAt: jobCancelRequests.refundProcessedAt,
      payoutProcessedAt: jobCancelRequests.payoutProcessedAt,
    })
    .from(jobCancelRequests)
    .where(and(eq(jobCancelRequests.jobId, jobId), eq(jobCancelRequests.status, "approved")))
    .orderBy(jobCancelRequests.createdAt)
    .limit(1);

  const cancelRequest = cancelRows[0] ?? null;
  if (!cancelRequest) {
    return err(409, "ADMIN_V4_NO_APPROVED_CANCEL_REQUEST", "No approved cancel request found. Use Cancel Job first.");
  }

  if (cancelRequest.refundProcessedAt) {
    return err(409, "ADMIN_V4_REFUND_ALREADY_PROCESSED", "Refund has already been processed for this cancellation");
  }

  // Ledger deduplication check (second layer)
  const dedupeKey = `cancel_refund_${jobId}_${cancelRequest.id}`;
  const existingLedger = await db
    .select({ id: v4FinancialLedger.id })
    .from(v4FinancialLedger)
    .where(eq(v4FinancialLedger.dedupeKey, dedupeKey))
    .limit(1);

  if (existingLedger[0]) {
    return err(409, "ADMIN_V4_REFUND_ALREADY_PROCESSED", "Refund ledger entry already exists — action already completed");
  }

  // Backend-enforced action matrix: never trust UI for amounts
  const posterInWindow =
    String(cancelRequest.requestedByRole ?? "") === "JOB_POSTER" &&
    Boolean(cancelRequest.withinPenaltyWindow);

  const totalAmountCents = Number(job.amountCents ?? 0);
  // Use splitByPercent for the primary (refund) portion — remainder is the contractor's 25%.
  // This guarantees refundCents + payoutCents = totalAmountCents (no penny lost).
  const refundCents = posterInWindow
    ? splitByPercent(totalAmountCents, 75).primary
    : totalAmountCents;

  if (refundCents <= 0) {
    return err(409, "ADMIN_V4_INVALID_REFUND_AMOUNT", "Refund amount is zero — check job amount");
  }

  // Call Stripe
  let stripeRefundId: string;
  try {
    const result = await refundPaymentIntent({
      paymentIntentId: job.stripePaymentIntentId,
      amountCents: refundCents,
      idempotencyKey: dedupeKey,
      metadata: {
        jobId,
        cancelRequestId: cancelRequest.id,
        adminId: authed.adminId,
        refundType: posterInWindow ? "PARTIAL_75" : "FULL",
      },
    });
    stripeRefundId = result.refundId;
  } catch (stripeErr) {
    console.error("[ADMIN_V4_PARTIAL_REFUND_STRIPE_ERROR]", {
      jobId,
      message: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
    });
    return err(502, "ADMIN_V4_STRIPE_REFUND_FAILED", "Stripe refund failed — see server logs");
  }

  // Determine if we should resolve the support ticket now
  const shouldResolveTicket = !posterInWindow || Boolean(cancelRequest.payoutProcessedAt);

  try {
    await db.transaction(async (tx) => {
      // Update job payment status: PARTIALLY_REFUNDED for 75% case, REFUNDED for full
      const newPaymentStatus = posterInWindow ? ("PARTIALLY_REFUNDED" as any) : ("REFUNDED" as any);
      await tx
        .update(jobs)
        .set({
          payment_status: newPaymentStatus,
          refunded_at: now,
          updated_at: now,
        })
        .where(eq(jobs.id, jobId));

      // Update escrow
      const escrowRows = await tx
        .select({ id: escrows.id })
        .from(escrows)
        .where(eq(escrows.jobId, jobId))
        .limit(1);
      if (escrowRows[0]) {
        await tx
          .update(escrows)
          .set({ status: posterInWindow ? ("PARTIALLY_REFUNDED" as any) : ("REFUNDED" as any), updatedAt: now })
          .where(eq(escrows.id, escrowRows[0].id));
      }

      // Financial ledger entry
      await tx.insert(v4FinancialLedger).values({
        id: randomUUID(),
        jobId,
        type: "JOB_CANCELLATION_REFUND",
        amountCents: refundCents,
        currency: String(job.paymentCurrency ?? "CAD").toUpperCase(),
        stripeRef: stripeRefundId,
        dedupeKey,
        metaJson: {
          cancelRequestId: cancelRequest.id,
          requestedByRole: cancelRequest.requestedByRole,
          withinPenaltyWindow: cancelRequest.withinPenaltyWindow,
          refundType: posterInWindow ? "PARTIAL_75" : "FULL",
          adminId: authed.adminId,
        },
        createdAt: now,
      });

      // Mark refund as processed on cancel request
      await tx
        .update(jobCancelRequests)
        .set({
          status: "refunded",
          refundProcessedAt: now,
          resolvedAt: shouldResolveTicket ? now : undefined,
        })
        .where(eq(jobCancelRequests.id, cancelRequest.id));

      // Resolve support ticket if all required actions are complete
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

      // Audit log
      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: null,
        actorAdminUserId: authed.adminId as any,
        action: "JOB_CANCELLATION_REFUND_ISSUED",
        entityType: "Job",
        entityId: jobId,
        metadata: {
          action: posterInWindow ? "PARTIAL_REFUND_75" : "FULL_REFUND",
          jobId,
          cancelRequestId: cancelRequest.id,
          stripeRefundId,
          refundCents,
          totalAmountCents,
          posterInWindow,
          adminId: authed.adminId,
          adminEmail: authed.email,
          refundedAt: now.toISOString(),
        } as any,
      });
    });

    // Append idempotent system message to the job thread
    if (shouldResolveTicket) {
      const msgDedupeMarker = posterInWindow
        ? `cancel_resolution_${jobId}_poster_in_window`
        : String(cancelRequest.requestedByRole ?? "") === "CONTRACTOR"
          ? `cancel_resolution_${jobId}_contractor_in_window`
          : `cancel_resolution_${jobId}_outside_window`;

      const msgBody = posterInWindow
        ? "The Job Poster cancelled this job within the 8-hour scheduled window. The contractor received 25% compensation. This job is now closed."
        : "This job has been cancelled and the payment has been refunded in full.";

      await appendSystemMessageByJobId(jobId, msgBody, msgDedupeMarker).catch(() => null);
    }

    // Emit resolution event if fully resolved
    if (shouldResolveTicket) {
      await emitDomainEvent(
        {
          type: "JOB_ASSIGNED_CANCELLATION_RESOLVED",
          payload: {
            jobId,
            jobPosterId: String(job.jobPosterUserId ?? ""),
            contractorId: "",
            cancelledBy: String(cancelRequest.requestedByRole ?? "") as "JOB_POSTER" | "CONTRACTOR",
            withinPenaltyWindow: Boolean(cancelRequest.withinPenaltyWindow),
            resolutionType: posterInWindow ? "PARTIAL_REFUND_WITH_CONTRACTOR_PAYOUT" : "FULL_REFUND",
            refundAmountCents: refundCents,
            payoutAmountCents: 0,
            suspensionApplied: false,
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
      stripeRefundId,
      refundCents,
      posterInWindow,
      ticketResolved: shouldResolveTicket,
      cancelRequest: refreshed?.cancelRequest ?? null,
    });
  } catch (error) {
    console.error("[ADMIN_V4_PARTIAL_REFUND_ERROR]", {
      jobId,
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_PARTIAL_REFUND_FAILED", "Failed to process refund");
  }
}
