import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { jobs, jobCancelRequests, auditLogs } from "@/db/schema";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { contractors } from "@/db/schema/contractor";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { v4FinancialLedger } from "@/db/schema/v4FinancialLedger";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { createContractorTransfer } from "@/src/payments/stripe";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";
import { getAdminJobDetail } from "@/src/services/adminV4/jobsReadService";
import { splitByPercent } from "@/src/utils/finance/splitByPercent";
import { appendSystemMessageByJobId } from "@/src/services/v4/v4MessageService";

const BodySchema = z.object({
  confirmText: z.string(),
});

/**
 * POST /api/admin/v4/jobs/[id]/contractor-payout
 *
 * Issues a 25% payout to the contractor when:
 *   - Job Poster cancelled within the 8-hour penalty window
 *
 * Backend enforces the action matrix — this route rejects if the scenario
 * does not meet the payout condition (poster+inWindow only).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id: jobId } = await ctx.params;
  const now = new Date();

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success || parsed.data.confirmText !== "PAYOUT") {
    return err(400, "ADMIN_V4_CONFIRM_REQUIRED", "Please type PAYOUT to confirm");
  }

  // Load job
  const jobRows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      contractorUserId: jobs.contractor_user_id,
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
    return err(409, "ADMIN_V4_PAYOUT_INVALID_STATUS", "Job must be CANCELLED before issuing a payout");
  }

  // Load approved cancel request
  const cancelRows = await db
    .select({
      id: jobCancelRequests.id,
      status: jobCancelRequests.status,
      requestedByRole: jobCancelRequests.requestedByRole,
      withinPenaltyWindow: jobCancelRequests.withinPenaltyWindow,
      supportTicketId: jobCancelRequests.supportTicketId,
      payoutProcessedAt: jobCancelRequests.payoutProcessedAt,
      refundProcessedAt: jobCancelRequests.refundProcessedAt,
    })
    .from(jobCancelRequests)
    .where(and(eq(jobCancelRequests.jobId, jobId), eq(jobCancelRequests.status, "approved")))
    .orderBy(jobCancelRequests.createdAt)
    .limit(1);

  // Also try refunded status (refund may have been processed first)
  const cancelRowsRefunded = !cancelRows[0]
    ? await db
        .select({
          id: jobCancelRequests.id,
          status: jobCancelRequests.status,
          requestedByRole: jobCancelRequests.requestedByRole,
          withinPenaltyWindow: jobCancelRequests.withinPenaltyWindow,
          supportTicketId: jobCancelRequests.supportTicketId,
          payoutProcessedAt: jobCancelRequests.payoutProcessedAt,
          refundProcessedAt: jobCancelRequests.refundProcessedAt,
        })
        .from(jobCancelRequests)
        .where(and(eq(jobCancelRequests.jobId, jobId), eq(jobCancelRequests.status, "refunded")))
        .orderBy(jobCancelRequests.createdAt)
        .limit(1)
    : [];

  const cancelRequest = cancelRows[0] ?? cancelRowsRefunded[0] ?? null;
  if (!cancelRequest) {
    return err(409, "ADMIN_V4_NO_CANCEL_REQUEST", "No cancel request found for this job. Use Cancel Job first.");
  }

  // Backend action matrix enforcement — payout only for poster+inWindow
  const posterInWindow =
    String(cancelRequest.requestedByRole ?? "") === "JOB_POSTER" &&
    Boolean(cancelRequest.withinPenaltyWindow);

  if (!posterInWindow) {
    return err(
      409,
      "ADMIN_V4_PAYOUT_NOT_APPLICABLE",
      "Contractor payout only applies when the Job Poster cancelled within the 8-hour penalty window",
    );
  }

  if (cancelRequest.payoutProcessedAt) {
    return err(409, "ADMIN_V4_PAYOUT_ALREADY_PROCESSED", "Payout has already been processed for this cancellation");
  }

  // Ledger deduplication check
  const dedupeKey = `cancel_payout_${jobId}_${cancelRequest.id}`;
  const existingLedger = await db
    .select({ id: v4FinancialLedger.id })
    .from(v4FinancialLedger)
    .where(eq(v4FinancialLedger.dedupeKey, dedupeKey))
    .limit(1);

  if (existingLedger[0]) {
    return err(409, "ADMIN_V4_PAYOUT_ALREADY_PROCESSED", "Payout ledger entry already exists — action already completed");
  }

  if (!job.contractorUserId) {
    return err(409, "ADMIN_V4_NO_CONTRACTOR", "No contractor assigned to this job");
  }

  // Load contractor Stripe readiness via contractorProfilesV4 → contractors join
  const contractorProfileRows = await db
    .select({
      email: contractorProfilesV4.email,
      stripeAccountId: contractorAccounts.stripeAccountId,
    })
    .from(contractorProfilesV4)
    .innerJoin(contractorAccounts, eq(contractorAccounts.userId, contractorProfilesV4.userId))
    .where(eq(contractorProfilesV4.userId, job.contractorUserId))
    .limit(1);

  const contractorProfile = contractorProfileRows[0] ?? null;
  if (!contractorProfile?.stripeAccountId) {
    return err(409, "ADMIN_V4_CONTRACTOR_NO_STRIPE_ACCOUNT", "Contractor does not have a Stripe account set up");
  }

  // Look up payoutsEnabled from the legacy contractors table (by email)
  let stripePayoutsEnabled = false;
  if (contractorProfile.email) {
    const legacyRows = await db
      .select({ stripePayoutsEnabled: contractors.stripePayoutsEnabled })
      .from(contractors)
      .where(eq(contractors.email, contractorProfile.email))
      .limit(1);
    stripePayoutsEnabled = Boolean(legacyRows[0]?.stripePayoutsEnabled);
  }

  if (!stripePayoutsEnabled) {
    return err(409, "ADMIN_V4_CONTRACTOR_NOT_PAYOUT_READY", "Contractor payouts are not enabled on their Stripe account");
  }

  const totalAmountCents = Number(job.amountCents ?? 0);
  // Complement of the 75% refund: refund + payout === totalAmountCents (no penny lost).
  const { primary: refundPrimary, remainder: payoutCents } = splitByPercent(totalAmountCents, 75);

  if (payoutCents <= 0) {
    return err(409, "ADMIN_V4_INVALID_PAYOUT_AMOUNT", "Payout amount is zero — check job amount");
  }

  // Call Stripe transfer
  let stripeTransferId: string;
  try {
    const result = await createContractorTransfer({
      stripeAccountId: contractorProfile.stripeAccountId,
      stripePayoutsEnabled,
      amountCents: payoutCents,
      currency: String(job.paymentCurrency ?? "cad"),
      metadata: {
        jobId,
        cancelRequestId: cancelRequest.id,
        adminId: authed.adminId,
        payoutType: "ASSIGNED_CANCEL_25_PERCENT",
      },
      idempotencyKey: dedupeKey,
    });
    stripeTransferId = result.transferId;
  } catch (stripeErr: any) {
    console.error("[ADMIN_V4_CONTRACTOR_PAYOUT_STRIPE_ERROR]", {
      jobId,
      message: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
    });
    const code = stripeErr?.code ?? "ADMIN_V4_STRIPE_TRANSFER_FAILED";
    return err(502, code, stripeErr?.message ?? "Stripe transfer failed — see server logs");
  }

  // Determine if we should resolve the support ticket now
  const shouldResolveTicket = Boolean(cancelRequest.refundProcessedAt);

  try {
    await db.transaction(async (tx) => {
      // Financial ledger entry
      await tx.insert(v4FinancialLedger).values({
        id: randomUUID(),
        jobId,
        type: "JOB_CANCELLATION_CONTRACTOR_PAYOUT",
        amountCents: payoutCents,
        currency: String(job.paymentCurrency ?? "CAD").toUpperCase(),
        stripeRef: stripeTransferId,
        dedupeKey,
        metaJson: {
          cancelRequestId: cancelRequest.id,
          contractorUserId: job.contractorUserId,
          payoutPercent: 25,
          adminId: authed.adminId,
        },
        createdAt: now,
      });

      // Mark payout as processed
      await tx
        .update(jobCancelRequests)
        .set({
          payoutProcessedAt: now,
          resolvedAt: shouldResolveTicket ? now : undefined,
        })
        .where(eq(jobCancelRequests.id, cancelRequest.id));

      // Resolve support ticket if refund was already done (both actions complete)
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
        action: "JOB_CANCELLATION_PAYOUT_ISSUED",
        entityType: "Job",
        entityId: jobId,
        metadata: {
          jobId,
          cancelRequestId: cancelRequest.id,
          stripeTransferId,
          payoutCents,
          contractorUserId: job.contractorUserId,
          adminId: authed.adminId,
          adminEmail: authed.email,
          payoutAt: now.toISOString(),
        } as any,
      });
    });

    // Append idempotent system message when payout completes the resolution
    if (shouldResolveTicket) {
      await appendSystemMessageByJobId(
        jobId,
        "The Job Poster cancelled this job within the 8-hour scheduled window. The contractor received 25% compensation. This job is now closed.",
        `cancel_resolution_${jobId}_poster_in_window`,
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
            cancelledBy: "JOB_POSTER",
            withinPenaltyWindow: true,
            resolutionType: "PARTIAL_REFUND_WITH_CONTRACTOR_PAYOUT",
            refundAmountCents: refundPrimary,
            payoutAmountCents: payoutCents,
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
      stripeTransferId,
      payoutCents,
      ticketResolved: shouldResolveTicket,
      cancelRequest: refreshed?.cancelRequest ?? null,
    });
  } catch (error) {
    console.error("[ADMIN_V4_CONTRACTOR_PAYOUT_ERROR]", {
      jobId,
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_CONTRACTOR_PAYOUT_FAILED", "Failed to process contractor payout");
  }
}
