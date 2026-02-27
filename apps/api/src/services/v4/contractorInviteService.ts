import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";
import { v4JobAssignments } from "@/db/schema/v4JobAssignment";
import { jobs } from "@/db/schema/job";
import { v4MessageThreads } from "@/db/schema/v4MessageThread";
import { v4Notifications } from "@/db/schema/v4Notification";
import { writeEscrowAllocationLedger } from "@/src/services/escrow/ledger";
import { computeEscrowSplitAllocations } from "@/src/services/escrow/pricing";
import { badRequest, conflict, forbidden } from "./v4Errors";
import { getContractorStripeSnapshot, isContractorStripeVerifiedForJobAcceptance } from "./contractorStripeService";

export async function listInvites(contractorUserId: string) {
  const rows = await db
    .select({
      id: v4ContractorJobInvites.id,
      jobId: v4ContractorJobInvites.jobId,
      routeId: v4ContractorJobInvites.routeId,
      status: v4ContractorJobInvites.status,
      createdAt: v4ContractorJobInvites.createdAt,
      title: jobs.title,
      scope: jobs.scope,
      region: jobs.region,
    })
    .from(v4ContractorJobInvites)
    .innerJoin(jobs, eq(jobs.id, v4ContractorJobInvites.jobId))
    .where(and(eq(v4ContractorJobInvites.contractorUserId, contractorUserId), eq(v4ContractorJobInvites.status, "PENDING")))
    .orderBy(v4ContractorJobInvites.createdAt);

  const paymentReady = await getContractorStripeSnapshot(contractorUserId);
  return { invites: rows, paymentReady };
}

export async function getInviteByJob(contractorUserId: string, jobId: string) {
  const rows = await db
    .select()
    .from(v4ContractorJobInvites)
    .where(and(eq(v4ContractorJobInvites.contractorUserId, contractorUserId), eq(v4ContractorJobInvites.jobId, jobId)))
    .limit(1);
  return rows[0] ?? null;
}

function toCurrency(job: { currency: string | null; country: string | null }): "USD" | "CAD" {
  if (String(job.currency ?? "").toUpperCase() === "CAD") return "CAD";
  if (String(job.country ?? "").toUpperCase() === "CA") return "CAD";
  return "USD";
}

export async function acceptInvite(contractorUserId: string, jobId: string) {
  const invite = await getInviteByJob(contractorUserId, jobId);
  if (!invite) throw badRequest("V4_INVITE_NOT_FOUND", "Invite not found");
  if (invite.status !== "PENDING") throw conflict("V4_INVITE_ALREADY_RESPONDED", "Invite already accepted or rejected");

  const jobRows = await db
    .select({ jobPosterUserId: jobs.job_poster_user_id })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  const job = jobRows[0] ?? null;
  const jobPosterUserId = job?.jobPosterUserId ?? null;
  if (!jobPosterUserId) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");

  await db.transaction(async (tx) => {
    const paymentReady = await isContractorStripeVerifiedForJobAcceptance(contractorUserId);
    if (!paymentReady) {
      await tx.insert(v4Notifications).values({
        id: randomUUID(),
        userId: contractorUserId,
        role: "CONTRACTOR",
        type: "PAYMENT_SETUP_REQUIRED",
        title: "Payment setup required",
        message: "You must complete Payment Setup before accepting jobs.",
        entityType: "JOB",
        entityId: jobId,
        priority: "HIGH",
        createdAt: new Date(),
      });
      throw forbidden("V4_PAYMENT_SETUP_REQUIRED", "You must complete Payment Setup before accepting jobs.");
    }

    await tx.execute(sql`select id from jobs where id = ${jobId} for update`);

    const lockedJobRows = await tx
      .select({
        id: jobs.id,
        status: jobs.status,
        paymentStatus: jobs.payment_status,
        amountCents: jobs.amount_cents,
        totalAmountCents: jobs.total_amount_cents,
        appraisalSubtotalCents: jobs.appraisal_subtotal_cents,
        regionalFeeCents: jobs.regional_fee_cents,
        taxAmountCents: jobs.tax_amount_cents,
        laborTotalCents: jobs.labor_total_cents,
        priceAdjustmentCents: jobs.price_adjustment_cents,
        transactionFeeCents: jobs.transaction_fee_cents,
        stripePaymentIntentId: jobs.stripe_payment_intent_id,
        stripePaymentIntentStatus: jobs.stripe_payment_intent_status,
        stripePaidAt: jobs.stripe_paid_at,
        stripeRefundedAt: jobs.stripe_refunded_at,
        country: jobs.country,
        currency: jobs.currency,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const lockedJob = lockedJobRows[0] ?? null;
    if (!lockedJob) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");

    if (String(lockedJob.status ?? "").toUpperCase() !== "OPEN_FOR_ROUTING") {
      throw conflict("V4_JOB_NOT_ASSIGNABLE", "Job is no longer available for assignment");
    }

    const now = new Date();

    const existingAssignment = await tx
      .select({ id: v4JobAssignments.id })
      .from(v4JobAssignments)
      .where(and(eq(v4JobAssignments.jobId, jobId), eq(v4JobAssignments.contractorUserId, contractorUserId)))
      .limit(1);
    if (existingAssignment.length > 0) {
      throw conflict("V4_ASSIGNMENT_ALREADY_EXISTS", "Assignment already exists for this job");
    }

    const paymentIntentId = String(lockedJob.stripePaymentIntentId ?? "").trim();
    if (!paymentIntentId) {
      throw conflict("V4_PAYMENT_NOT_PAID", "Paid payment intent is required");
    }
    const paymentStatus = String(lockedJob.paymentStatus ?? "").toUpperCase();
    if (paymentStatus === "REFUNDED" || lockedJob.stripeRefundedAt instanceof Date) {
      throw conflict("V4_PAYMENT_REFUNDED", "Payment has been refunded");
    }
    if (!["FUNDS_SECURED", "FUNDED"].includes(paymentStatus)) {
      throw conflict("V4_PAYMENT_NOT_PAID", "Payment must be completed before acceptance");
    }
    if (!(lockedJob.stripePaidAt instanceof Date)) {
      throw conflict("V4_PAYMENT_NOT_PAID", "Payment timestamp missing");
    }

    const appraisalSubtotalCents = Math.max(
      0,
      Number(lockedJob.appraisalSubtotalCents ?? 0) || Number(lockedJob.laborTotalCents ?? 0),
    );
    const regionalFeeCents = Math.max(
      0,
      Number(lockedJob.regionalFeeCents ?? 0) || Number(lockedJob.priceAdjustmentCents ?? 0),
    );
    const taxAmountCents = Math.max(
      0,
      Number(lockedJob.taxAmountCents ?? 0) || Number(lockedJob.transactionFeeCents ?? 0),
    );
    const totalAmountCents = Math.max(0, Number(lockedJob.totalAmountCents ?? 0) || Number(lockedJob.amountCents ?? 0));
    const split = computeEscrowSplitAllocations({
      appraisalSubtotalCents,
      regionalFeeCents,
      taxAmountCents,
    });
    if (split.totalCents !== totalAmountCents) {
      throw conflict("V4_PAYMENT_SPLIT_MISMATCH", "Escrow split does not match total");
    }

    await tx
      .update(v4ContractorJobInvites)
      .set({ status: "ACCEPTED" })
      .where(eq(v4ContractorJobInvites.id, invite.id));

    const assignmentId = randomUUID();
    await tx.insert(v4JobAssignments).values({
      id: assignmentId,
      jobId,
      contractorUserId,
      status: "ASSIGNED",
    });

    await tx
      .update(jobs)
      .set({
        status: "ASSIGNED" as any,
        contractor_user_id: contractorUserId,
        accepted_at: now,
        stripe_payment_intent_status: String(lockedJob.stripePaymentIntentStatus ?? "succeeded"),
        payment_status: "FUNDS_SECURED" as any,
        updated_at: now,
      })
      .where(eq(jobs.id, jobId));

    const currency = toCurrency({ currency: lockedJob.currency ?? null, country: lockedJob.country ?? null });

    await writeEscrowAllocationLedger(tx as any, {
      jobId,
      currency,
      contractorUserId,
      routerUserId: String(invite.routeId),
      appraisalSubtotalCents,
      regionalFeeCents,
      taxAmountCents,
      paymentIntentId,
    });

    await tx.insert(v4Notifications).values({
      id: randomUUID(),
      userId: jobPosterUserId,
      role: "JOB_POSTER",
      type: "CONTRACTOR_ASSIGNED",
      title: "Contractor Assigned",
      message: "A contractor has been assigned to your job.",
      entityType: "JOB",
      entityId: jobId,
      priority: "NORMAL",
      createdAt: new Date(),
    });

    const existingThread = await tx
      .select({ id: v4MessageThreads.id })
      .from(v4MessageThreads)
      .where(
        and(
          eq(v4MessageThreads.jobId, jobId),
          eq(v4MessageThreads.jobPosterUserId, jobPosterUserId),
          eq(v4MessageThreads.contractorUserId, contractorUserId),
        ),
      )
      .limit(1);
    if (existingThread.length === 0) {
      await tx.insert(v4MessageThreads).values({
        id: randomUUID(),
        jobId,
        jobPosterUserId,
        contractorUserId,
      });
    }
  });
}

export async function rejectInvite(contractorUserId: string, jobId: string) {
  const invite = await getInviteByJob(contractorUserId, jobId);
  if (!invite) throw badRequest("V4_INVITE_NOT_FOUND", "Invite not found");
  if (invite.status !== "PENDING") throw conflict("V4_INVITE_ALREADY_RESPONDED", "Invite already accepted or rejected");

  await db
    .update(v4ContractorJobInvites)
    .set({ status: "REJECTED" })
    .where(eq(v4ContractorJobInvites.id, invite.id));
}
