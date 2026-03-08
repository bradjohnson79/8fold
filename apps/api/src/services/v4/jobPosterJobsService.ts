import { and, desc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { jobEditRequests, jobCancelRequests } from "@/db/schema";
import { refundUnassignedJob } from "@/src/services/escrow/refundService";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";
import { badRequest, conflict, forbidden } from "@/src/services/v4/v4Errors";
import {
  computeExecutionEligibility,
  mapLegacyStatusForExecution,
} from "./jobExecutionService";

export type JobListItem = {
  id: string;
  title: string;
  tradeCategory: string;
  status: string;
  routingStatus: string;
  amountCents: number;
  currency: string;
  region: string | null;
  city: string | null;
  createdAt: string;
};

type MinimalRow = {
  id: string;
  title: string | null;
  trade_category: string | null;
  status: string | null;
  routing_status: string | null;
  amount_cents: number | null;
  currency: string | null;
  region: string | null;
  city: string | null;
  created_at: Date | string | null;
};

export async function listJobsForJobPoster(userId: string): Promise<JobListItem[]> {
  try {
    const res = await db.execute<MinimalRow>(
      sql`
        SELECT
          id,
          title,
          trade_category,
          status,
          routing_status,
          amount_cents,
          currency,
          region,
          city,
          created_at
        FROM jobs
        WHERE job_poster_user_id = ${userId}
          AND archived = false
          AND status != 'COMPLETED'
        ORDER BY created_at DESC
      `,
    );
    const rows = (res as { rows?: MinimalRow[] })?.rows ?? [];

    return rows.map((r) => ({
      id: String(r.id ?? ""),
      title: String(r.title ?? ""),
      tradeCategory: String(r.trade_category ?? ""),
      status: String(r.status ?? ""),
      routingStatus: String(r.routing_status ?? ""),
      amountCents: Number(r.amount_cents ?? 0),
      currency: String(r.currency ?? ""),
      region: r.region != null ? String(r.region) : null,
      city: r.city != null ? String(r.city) : null,
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : typeof r.created_at === "string"
            ? r.created_at
            : "",
    }));
  } catch (err: unknown) {
    const pg = (err as { cause?: Record<string, unknown>; code?: string; message?: string; detail?: string; column?: string; schema?: string; table?: string; constraint?: string }) ?? {};
    const cause = (pg.cause ?? pg) as Record<string, unknown>;
    console.error("[JP_JOBS_LIST] select_failed", {
      code: cause.code ?? pg.code,
      message: cause.message ?? pg.message,
      detail: cause.detail ?? pg.detail,
      schema: cause.schema ?? pg.schema,
      table: cause.table ?? pg.table,
      column: cause.column ?? pg.column,
      constraint: cause.constraint ?? pg.constraint,
    });
    throw err;
  }
}

export type PendingRequest = { submittedAt: string } | null;

export type JobDetail = {
  id: string;
  title: string;
  scope: string;
  status: string;
  routingStatus: string;
  amountCents: number;
  addressFull: string | null;
  tradeCategory: string;
  createdAt: string;
  canMarkComplete: boolean;
  executionStatus: string;
  contractorMarkedCompleteAt: string | null;
  posterMarkedCompleteAt: string | null;
  completedAt: string | null;
  region: string | null;
  city: string | null;
  regionName: string | null;
  pendingEditRequest: PendingRequest;
  pendingCancelRequest: PendingRequest;
  /** Set when contractor assigned; frontend uses to block cancel request. */
  assignedContractorId: string | null;
};

/**
 * Minimal read-only job detail for Job Poster Job Review page.
 * - No mutations (promoteDuePublishedJobs removed; was causing side effects on read).
 * - Direct jobs table query with ownership check.
 * - Pending requests wrapped in try/catch; returns null if tables missing or query fails.
 */
export async function getJobDetailForJobPoster(jobId: string, userId: string): Promise<JobDetail | null> {
  try {
    const rows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        scope: jobs.scope,
        status: jobs.status,
        routing_status: jobs.routing_status,
        amount_cents: jobs.amount_cents,
        address_full: jobs.address_full,
        trade_category: jobs.trade_category,
        created_at: jobs.created_at,
        region: jobs.region,
        region_code: jobs.region_code,
        region_name: jobs.region_name,
        city: jobs.city,
        job_poster_user_id: jobs.job_poster_user_id,
        contractor_user_id: jobs.contractor_user_id,
        appointment_at: jobs.appointment_at,
        completed_at: jobs.completed_at,
        contractor_marked_complete_at: jobs.contractor_marked_complete_at,
        poster_marked_complete_at: jobs.poster_marked_complete_at,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    const row = rows[0];
    if (!row || String(row.job_poster_user_id ?? "") !== userId) return null;

    const appointmentAt = row.appointment_at instanceof Date ? row.appointment_at : null;
    const completedAt = row.completed_at instanceof Date ? row.completed_at : null;
    const contractorMarkedCompleteAt =
      row.contractor_marked_complete_at instanceof Date ? row.contractor_marked_complete_at : null;
    const posterMarkedCompleteAt =
      row.poster_marked_complete_at instanceof Date ? row.poster_marked_complete_at : null;

    const eligibility = computeExecutionEligibility(
      {
        id: row.id,
        status: mapLegacyStatusForExecution(String(row.status ?? "")),
        appointment_at: appointmentAt,
        completed_at: completedAt,
        contractor_marked_complete_at: contractorMarkedCompleteAt,
        poster_marked_complete_at: posterMarkedCompleteAt,
      },
      new Date(),
    );

    let pendingEditRequest: PendingRequest = null;
    let pendingCancelRequest: PendingRequest = null;
    try {
      const [pendingEdit, pendingCancel] = await Promise.all([
        db
          .select({ createdAt: jobEditRequests.createdAt })
          .from(jobEditRequests)
          .where(and(eq(jobEditRequests.jobId, jobId), eq(jobEditRequests.status, "pending")))
          .orderBy(desc(jobEditRequests.createdAt))
          .limit(1),
        db
          .select({ createdAt: jobCancelRequests.createdAt })
          .from(jobCancelRequests)
          .where(and(eq(jobCancelRequests.jobId, jobId), eq(jobCancelRequests.status, "pending")))
          .orderBy(desc(jobCancelRequests.createdAt))
          .limit(1),
      ]);
      pendingEditRequest = pendingEdit[0]
        ? { submittedAt: pendingEdit[0].createdAt instanceof Date ? pendingEdit[0].createdAt.toISOString() : String(pendingEdit[0].createdAt) }
        : null;
      pendingCancelRequest = pendingCancel[0]
        ? { submittedAt: pendingCancel[0].createdAt instanceof Date ? pendingCancel[0].createdAt.toISOString() : String(pendingCancel[0].createdAt) }
        : null;
    } catch (reqErr) {
      console.error("JOB_POSTER_JOB_DETAIL_ERROR", { jobId, phase: "pending_requests", error: reqErr });
    }

    return {
      id: String(row.id ?? ""),
      title: String(row.title ?? ""),
      scope: String(row.scope ?? ""),
      status: mapLegacyStatusForExecution(String(row.status ?? "")),
      routingStatus: String(row.routing_status ?? ""),
      amountCents: Number(row.amount_cents ?? 0),
      addressFull: row.address_full != null ? String(row.address_full) : null,
      tradeCategory: String(row.trade_category ?? ""),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : "",
      canMarkComplete: eligibility.canMarkComplete,
      executionStatus: eligibility.executionStatus,
      contractorMarkedCompleteAt: contractorMarkedCompleteAt != null ? contractorMarkedCompleteAt.toISOString() : null,
      posterMarkedCompleteAt: posterMarkedCompleteAt != null ? posterMarkedCompleteAt.toISOString() : null,
      completedAt: completedAt != null ? completedAt.toISOString() : null,
      region: row.region_code != null ? String(row.region_code) : row.region != null ? String(row.region) : null,
      city: row.city != null ? String(row.city) : null,
      regionName: row.region_name != null ? String(row.region_name) : null,
      pendingEditRequest,
      pendingCancelRequest,
      assignedContractorId: row.contractor_user_id != null ? String(row.contractor_user_id) : null,
    };
  } catch (err) {
    console.error("JOB_POSTER_JOB_DETAIL_ERROR", { jobId, userId, error: err });
    throw err;
  }
}

export async function releaseCompletedJobForPoster(jobId: string, userId: string): Promise<{ jobId: string; payoutStatus: string }> {
  const rows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      jobPosterUserId: jobs.job_poster_user_id,
      paymentStatus: jobs.payment_status,
      payoutStatus: jobs.payout_status,
      stripePaidAt: jobs.stripe_paid_at,
      stripeRefundedAt: jobs.stripe_refunded_at,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  const job = rows[0] ?? null;
  if (!job) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
  if (job.jobPosterUserId !== userId) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
  if (String(job.status ?? "").toUpperCase() !== "COMPLETED") {
    throw conflict("V4_JOB_NOT_COMPLETED", "Job must be completed before release");
  }
  const paymentStatus = String(job.paymentStatus ?? "").toUpperCase();
  if (!["FUNDS_SECURED", "FUNDED"].includes(paymentStatus)) {
    throw conflict("V4_PAYMENT_NOT_PAID", "Paid funds are required before release");
  }
  if (!job.stripePaidAt) {
    throw conflict("V4_PAYMENT_NOT_PAID", "Paid funds are required before release");
  }
  if (job.stripeRefundedAt || paymentStatus === "REFUNDED") {
    throw conflict("V4_PAYMENT_REFUNDED", "Refunded jobs cannot be released");
  }

  await db
    .update(jobs)
    .set({
      payout_status: "READY" as any,
      payment_released_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(jobs.id, jobId));

  return { jobId, payoutStatus: "READY" };
}

export async function refundRoutableUnassignedJobForPoster(jobId: string, userId: string): Promise<{
  jobId: string;
  refunded: boolean;
  idempotent: boolean;
  refundedAt: string | null;
  paymentStatus: string;
}> {
  const result = await refundUnassignedJob(
    jobId,
    {
      actorUserId: userId,
      actorType: "JOB_POSTER",
    },
    { expectedPosterUserId: userId },
  );

  if (result.ok) {
    return {
      jobId,
      refunded: true,
      idempotent: result.idempotent,
      refundedAt: result.refundedAt,
      paymentStatus: result.paymentStatus,
    };
  }

  if (result.reasonCode === "NOT_FOUND") throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
  if (result.reasonCode === "FORBIDDEN") throw forbidden("V4_JOB_NOT_FOUND", "Job not found");
  if (result.reasonCode === "MISSING_PAYMENT_INTENT") {
    throw conflict("V4_REFUND_MISSING_PAYMENT_INTENT", "Stripe payment intent is missing");
  }
  if (result.reasonCode === "REFUND_WINDOW_NOT_REACHED") {
    throw conflict("V4_REFUND_WINDOW_NOT_REACHED", "Refund is available 7 days after payment when unassigned");
  }
  if (result.reasonCode === "ASSIGNED") {
    throw conflict("V4_REFUND_NOT_ALLOWED_ASSIGNED", "Assigned jobs cannot be refunded");
  }
  if (result.reasonCode === "NOT_ROUTABLE") {
    throw conflict("V4_REFUND_NOT_ALLOWED_STATUS", "Refund is only allowed while the job remains routable");
  }
  if (result.reasonCode === "NOT_PAID") {
    throw conflict("V4_REFUND_NOT_ALLOWED_UNPAID", "Paid funds are required before refund");
  }
  if (result.reasonCode === "ALREADY_REFUNDED") {
    return {
      jobId,
      refunded: true,
      idempotent: true,
      refundedAt: result.refundedAt,
      paymentStatus: result.paymentStatus,
    };
  }

  throw conflict("V4_REFUND_FAILED", "Refund could not be processed");
}

export async function acceptAssignedContractorForJobPoster(jobId: string, userId: string): Promise<{ success: true; jobId: string }> {
  const rows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      jobPosterUserId: jobs.job_poster_user_id,
      contractorUserId: jobs.contractor_user_id,
      posterAcceptExpiresAt: jobs.poster_accept_expires_at,
      posterAcceptedAt: jobs.poster_accepted_at,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const job = rows[0] ?? null;
  if (!job || job.jobPosterUserId !== userId) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
  if (String(job.status ?? "").toUpperCase() !== "ASSIGNED") {
    throw conflict("V4_JOB_NOT_ASSIGNABLE", "Job is not awaiting poster acceptance");
  }

  const now = new Date();
  if (!job.posterAcceptExpiresAt || job.posterAcceptExpiresAt.getTime() <= now.getTime()) {
    throw conflict("V4_POSTER_ACCEPT_WINDOW_EXPIRED", "Poster acceptance window has expired");
  }

  if (!job.posterAcceptedAt) {
    await db
      .update(jobs)
      .set({ poster_accepted_at: now, updated_at: now })
      .where(eq(jobs.id, jobId));

    if (job.contractorUserId) {
      await emitDomainEvent({
        type: "POSTER_ACCEPTED_CONTRACTOR",
        payload: {
          jobId,
          contractorId: String(job.contractorUserId),
          createdAt: now,
          dedupeKey: `poster_accepted:${jobId}:${String(job.contractorUserId)}`,
        },
      });
    }
  }

  return { success: true as const, jobId };
}

export async function acceptAppointmentForJobPoster(
  jobId: string,
  userId: string,
): Promise<{ success: true; jobId: string; appointmentAcceptedAt: string }> {
  const rows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      jobPosterUserId: jobs.job_poster_user_id,
      contractorUserId: jobs.contractor_user_id,
      appointmentAt: jobs.appointment_at,
      appointmentAcceptedAt: jobs.appointment_accepted_at,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const job = rows[0] ?? null;
  if (!job || job.jobPosterUserId !== userId) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
  if (!job.contractorUserId) throw conflict("V4_JOB_NOT_ASSIGNED", "No contractor is assigned to this job");
  if (!(job.appointmentAt instanceof Date)) {
    throw conflict("V4_APPOINTMENT_NOT_BOOKED", "Contractor has not booked an appointment");
  }

  if (job.appointmentAcceptedAt instanceof Date) {
    return {
      success: true as const,
      jobId,
      appointmentAcceptedAt: job.appointmentAcceptedAt.toISOString(),
    };
  }

  const now = new Date();
  await db
    .update(jobs)
    .set({
      appointment_accepted_at: now,
      updated_at: now,
    })
    .where(eq(jobs.id, jobId));

  await emitDomainEvent({
    type: "APPOINTMENT_ACCEPTED",
    payload: {
      jobId,
      contractorId: String(job.contractorUserId),
      createdAt: now,
      dedupeKey: `appointment_accepted:${jobId}:${String(job.contractorUserId)}`,
    },
  });

  return {
    success: true as const,
    jobId,
    appointmentAcceptedAt: now.toISOString(),
  };
}

export async function createEditRequest(
  jobId: string,
  userId: string,
  payload: { requestedTitle: string; requestedDescription: string },
): Promise<{ requestId: string }> {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      scope: jobs.scope,
      jobPosterUserId: jobs.job_poster_user_id,
      contractorUserId: jobs.contractor_user_id,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  const job = rows[0];
  if (!job || String(job.jobPosterUserId ?? "") !== userId) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
  if (job.contractorUserId != null)
    throw conflict("V4_JOB_EDIT_ASSIGNED", "Job cannot be edited once a contractor has been assigned.");

  const pending = await db
    .select({ id: jobEditRequests.id })
    .from(jobEditRequests)
    .where(and(eq(jobEditRequests.jobId, jobId), eq(jobEditRequests.status, "pending")))
    .limit(1);
  if (pending[0]) throw conflict("V4_EDIT_REQUEST_PENDING", "A request is already pending for this job.");

  const title = String(job.title ?? "").trim();
  const scope = String(job.scope ?? "").trim();
  const reqTitle = String(payload.requestedTitle ?? "").trim();
  const reqDesc = String(payload.requestedDescription ?? "").trim();
  if (reqTitle === title && reqDesc === scope)
    throw badRequest("V4_EDIT_REQUEST_NO_CHANGE", "At least one field must differ from the current job.");

  const [inserted] = await db
    .insert(jobEditRequests)
    .values({
      jobId,
      jobPosterId: userId,
      originalTitle: title,
      originalDescription: scope,
      requestedTitle: reqTitle,
      requestedDescription: reqDesc,
    })
    .returning({ id: jobEditRequests.id });
  return { requestId: String(inserted?.id ?? "") };
}

export async function createCancelRequest(
  jobId: string,
  userId: string,
  payload: { reason: string },
): Promise<{ requestId: string }> {
  const rows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      jobPosterUserId: jobs.job_poster_user_id,
      contractorUserId: jobs.contractor_user_id,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  const job = rows[0];
  if (!job || String(job.jobPosterUserId ?? "") !== userId) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
  const status = String(job.status ?? "").toUpperCase();
  if (job.contractorUserId != null || status === "ASSIGNED")
    throw conflict("V4_CANCEL_REQUEST_ASSIGNED", "Only unassigned jobs can be cancelled through this request.");

  const pending = await db
    .select({ id: jobCancelRequests.id })
    .from(jobCancelRequests)
    .where(and(eq(jobCancelRequests.jobId, jobId), eq(jobCancelRequests.status, "pending")))
    .limit(1);
  if (pending[0]) throw conflict("V4_CANCEL_REQUEST_PENDING", "A request is already pending for this job.");

  const reason = String(payload.reason ?? "").trim();
  if (!reason) throw badRequest("V4_CANCEL_REQUEST_REASON", "Reason is required.");

  const [inserted] = await db
    .insert(jobCancelRequests)
    .values({
      jobId,
      jobPosterId: userId,
      reason,
    })
    .returning({ id: jobCancelRequests.id });

  await db.update(jobs).set({ cancel_request_pending: true, updated_at: new Date() }).where(eq(jobs.id, jobId));

  return { requestId: String(inserted?.id ?? "") };
}
