import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4EventOutbox } from "@/db/schema/v4EventOutbox";
import { v4JobAssignments } from "@/db/schema/v4JobAssignment";
import { badRequest, conflict } from "./v4Errors";
import {
  computeExecutionEligibility,
  isExecutionFinalStatus,
  mapLegacyStatusForExecution,
  normalizeExecutionStatus,
  shouldAutoTransitionToJobStarted,
  type ExecutionEligibility,
  type ExecutionJobRow,
} from "./jobExecutionRules";

const randomUUID = () => globalThis.crypto.randomUUID();

type Executor = typeof db | any;

async function emitJobStarted(jobId: string, payload: { contractorId?: string | null; jobPosterId?: string | null }, tx?: Executor) {
  const exec = tx ?? db;
  const now = new Date();
  await exec.insert(v4EventOutbox).values({
    id: randomUUID(),
    eventType: "JOB_STARTED",
    payload: {
      jobId,
      contractorId: payload.contractorId ? String(payload.contractorId) : null,
      jobPosterId: payload.jobPosterId ? String(payload.jobPosterId) : null,
      createdAt: now.toISOString(),
      dedupeKeyBase: `job_started:${jobId}`,
    } as Record<string, unknown>,
    createdAt: now,
  });
}

export async function applyJobStartedTransitionIfDue(
  exec: Executor,
  job: {
    id: string;
    status: string | null;
    appointmentAt: Date | null;
    contractorUserId?: string | null;
    jobPosterUserId?: string | null;
  },
  options?: { tx?: Executor },
): Promise<boolean> {
  const now = new Date();
  if (!shouldAutoTransitionToJobStarted(job.status, job.appointmentAt, now)) return false;

  const updated = await exec
    .update(jobs)
    .set({
      status: "JOB_STARTED" as any,
      updated_at: now,
    })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, "PUBLISHED")))
    .returning({ id: jobs.id });
  if (!updated[0]?.id) return false;

  await emitJobStarted(
    job.id,
    {
      contractorId: job.contractorUserId ?? null,
      jobPosterId: job.jobPosterUserId ?? null,
    },
    options?.tx,
  );
  return true;
}

async function bulkPromoteDuePublishedJobs(
  predicate: any,
  tx?: Executor,
): Promise<number> {
  const exec = tx ?? db;
  const now = new Date();

  const rows = await exec
    .update(jobs)
    .set({
      status: "JOB_STARTED" as any,
      updated_at: now,
    })
    .where(
      and(
        eq(jobs.status, "PUBLISHED"),
        lte(jobs.appointment_at, now),
        predicate,
      ),
    )
    .returning({
      id: jobs.id,
      contractorUserId: jobs.contractor_user_id,
      jobPosterUserId: jobs.job_poster_user_id,
    });

  for (const row of rows ?? []) {
    await emitJobStarted(
      String(row.id),
      {
        contractorId: row.contractorUserId ? String(row.contractorUserId) : null,
        jobPosterId: row.jobPosterUserId ? String(row.jobPosterUserId) : null,
      },
      tx,
    );
  }

  return rows.length;
}

export async function promoteDuePublishedJobsForContractor(contractorUserId: string, tx?: Executor): Promise<number> {
  return bulkPromoteDuePublishedJobs(eq(jobs.contractor_user_id, contractorUserId), tx);
}

export async function promoteDuePublishedJobsForJobPoster(jobPosterUserId: string, tx?: Executor): Promise<number> {
  return bulkPromoteDuePublishedJobs(eq(jobs.job_poster_user_id, jobPosterUserId), tx);
}

export async function promoteDuePublishedJobsForRouter(routerUserId: string, tx?: Executor): Promise<number> {
  return bulkPromoteDuePublishedJobs(eq(jobs.claimed_by_user_id, routerUserId), tx);
}

async function finalizeCompletionIfBothMarked(
  exec: Executor,
  input: {
    jobId: string;
    now: Date;
    contractorMarkedCompleteAt: Date | null;
    posterMarkedCompleteAt: Date | null;
    contractorUserId?: string | null;
    jobPosterUserId?: string | null;
    routerUserId?: string | null;
  },
): Promise<{ finalized: boolean; completedAt: Date | null }> {
  if (!input.contractorMarkedCompleteAt || !input.posterMarkedCompleteAt) {
    return { finalized: false, completedAt: null };
  }

  const completedAt = input.now;
  const updated = await exec
    .update(jobs)
    .set({
      status: "COMPLETED" as any,
      completed_at: completedAt,
      contractor_completed_at: input.contractorMarkedCompleteAt,
      customer_approved_at: input.posterMarkedCompleteAt,
      updated_at: completedAt,
    })
    .where(and(eq(jobs.id, input.jobId), inArray(jobs.status, ["JOB_STARTED", "IN_PROGRESS", "CUSTOMER_APPROVED", "CONTRACTOR_COMPLETED"] as any)))
    .returning({ id: jobs.id });

  if (!updated[0]?.id) return { finalized: false, completedAt: null };

  await exec.insert(v4EventOutbox).values({
    id: randomUUID(),
    eventType: "JOB_COMPLETED_FINALIZED",
    payload: {
      jobId: input.jobId,
      contractorId: input.contractorUserId ? String(input.contractorUserId) : null,
      jobPosterId: input.jobPosterUserId ? String(input.jobPosterUserId) : null,
      routerId: input.routerUserId ? String(input.routerUserId) : null,
      createdAt: completedAt.toISOString(),
      dedupeKeyBase: `job_completed_finalized:${input.jobId}`,
    } as Record<string, unknown>,
    createdAt: completedAt,
  });
  await exec.insert(v4EventOutbox).values({
    id: randomUUID(),
    eventType: "FUNDS_RELEASE_ELIGIBLE",
    payload: {
      jobId: input.jobId,
      contractorId: input.contractorUserId ? String(input.contractorUserId) : null,
      jobPosterId: input.jobPosterUserId ? String(input.jobPosterUserId) : null,
      routerId: input.routerUserId ? String(input.routerUserId) : null,
      createdAt: completedAt.toISOString(),
      dedupeKeyBase: `funds_release_eligible:${input.jobId}`,
    } as Record<string, unknown>,
    createdAt: completedAt,
  });

  return { finalized: true, completedAt };
}

export async function contractorMarkComplete(input: { contractorUserId: string; jobId: string }) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from jobs where id = ${input.jobId} for update`);

    const assignmentRows = await tx
      .select({
        id: v4JobAssignments.id,
        status: v4JobAssignments.status,
      })
      .from(v4JobAssignments)
      .where(and(eq(v4JobAssignments.jobId, input.jobId), eq(v4JobAssignments.contractorUserId, input.contractorUserId)))
      .limit(1);
    const assignment = assignmentRows[0] ?? null;
    if (!assignment) throw badRequest("V4_JOB_NOT_ASSIGNED_TO_CONTRACTOR", "Job not assigned to you");

    const jobRows = await tx
      .select({
        id: jobs.id,
        status: jobs.status,
        appointmentAt: jobs.appointment_at,
        completedAt: jobs.completed_at,
        contractorMarkedCompleteAt: jobs.contractor_marked_complete_at,
        posterMarkedCompleteAt: jobs.poster_marked_complete_at,
        contractorCompletedAt: jobs.contractor_completed_at,
        customerApprovedAt: jobs.customer_approved_at,
        contractorUserId: jobs.contractor_user_id,
        jobPosterUserId: jobs.job_poster_user_id,
        routerUserId: jobs.claimed_by_user_id,
      })
      .from(jobs)
      .where(eq(jobs.id, input.jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
    if (String(job.contractorUserId ?? "") !== input.contractorUserId) {
      throw badRequest("V4_JOB_NOT_ASSIGNED_TO_CONTRACTOR", "Job not assigned to you");
    }

    await applyJobStartedTransitionIfDue(
      tx,
      {
        id: job.id,
        status: job.status,
        appointmentAt: job.appointmentAt,
        contractorUserId: job.contractorUserId,
        jobPosterUserId: job.jobPosterUserId,
      },
      { tx },
    );

    const refreshed = await tx
      .select({
        status: jobs.status,
        appointmentAt: jobs.appointment_at,
        completedAt: jobs.completed_at,
        contractorMarkedCompleteAt: jobs.contractor_marked_complete_at,
        posterMarkedCompleteAt: jobs.poster_marked_complete_at,
        contractorCompletedAt: jobs.contractor_completed_at,
        customerApprovedAt: jobs.customer_approved_at,
      })
      .from(jobs)
      .where(eq(jobs.id, input.jobId))
      .limit(1);
    const current = refreshed[0] ?? null;
    if (!current) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");

    const now = new Date();
    if (!(current.appointmentAt instanceof Date) || now.getTime() < current.appointmentAt.getTime()) {
      throw conflict("V4_APPOINTMENT_NOT_REACHED", "Cannot mark complete before appointment time");
    }
    if (current.completedAt instanceof Date || isExecutionFinalStatus(current.status)) {
      return { ok: true as const, idempotent: true, finalized: true };
    }
    if (!["JOB_STARTED", "IN_PROGRESS"].includes(normalizeExecutionStatus(current.status))) {
      throw conflict("V4_JOB_NOT_STARTED", "Job must be started before marking completion");
    }
    if (current.contractorMarkedCompleteAt instanceof Date) {
      return { ok: true as const, idempotent: true, finalized: Boolean(current.posterMarkedCompleteAt) };
    }

    const completionWindowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await tx
      .update(jobs)
      .set({
        contractor_marked_complete_at: now,
        contractor_completed_at: current.contractorCompletedAt ?? now,
        completion_window_expires_at: completionWindowExpiresAt,
        status: normalizeExecutionStatus(current.status) === "IN_PROGRESS" ? ("JOB_STARTED" as any) : (current.status as any),
        updated_at: now,
      })
      .where(eq(jobs.id, input.jobId));

    await tx.insert(v4EventOutbox).values({
      id: randomUUID(),
      eventType: "CONTRACTOR_MARKED_COMPLETE",
      payload: {
        jobId: input.jobId,
        jobPosterId: job.jobPosterUserId ? String(job.jobPosterUserId) : null,
        contractorId: input.contractorUserId,
        createdAt: now.toISOString(),
        dedupeKeyBase: `contractor_marked_complete:${input.jobId}`,
      } as Record<string, unknown>,
      createdAt: now,
    });

    const finalized = await finalizeCompletionIfBothMarked(tx, {
      jobId: input.jobId,
      now,
      contractorMarkedCompleteAt: now,
      posterMarkedCompleteAt: current.posterMarkedCompleteAt,
      contractorUserId: input.contractorUserId,
      jobPosterUserId: job.jobPosterUserId ? String(job.jobPosterUserId) : null,
      routerUserId: job.routerUserId ? String(job.routerUserId) : null,
    });

    if (assignment.status !== "COMPLETED" && finalized.finalized) {
      await tx
        .update(v4JobAssignments)
        .set({ status: "COMPLETED" })
        .where(eq(v4JobAssignments.id, assignment.id));
    } else if (assignment.status === "ASSIGNED") {
      await tx
        .update(v4JobAssignments)
        .set({ status: "IN_PROGRESS" })
        .where(eq(v4JobAssignments.id, assignment.id));
    }

    return { ok: true as const, idempotent: false, finalized: finalized.finalized };
  });
}

export async function posterMarkComplete(input: { jobPosterUserId: string; jobId: string }) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from jobs where id = ${input.jobId} for update`);

    const jobRows = await tx
      .select({
        id: jobs.id,
        status: jobs.status,
        appointmentAt: jobs.appointment_at,
        completedAt: jobs.completed_at,
        contractorMarkedCompleteAt: jobs.contractor_marked_complete_at,
        posterMarkedCompleteAt: jobs.poster_marked_complete_at,
        contractorCompletedAt: jobs.contractor_completed_at,
        customerApprovedAt: jobs.customer_approved_at,
        contractorUserId: jobs.contractor_user_id,
        jobPosterUserId: jobs.job_poster_user_id,
        routerUserId: jobs.claimed_by_user_id,
      })
      .from(jobs)
      .where(eq(jobs.id, input.jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
    if (String(job.jobPosterUserId ?? "") !== input.jobPosterUserId) {
      throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
    }

    await applyJobStartedTransitionIfDue(
      tx,
      {
        id: job.id,
        status: job.status,
        appointmentAt: job.appointmentAt,
        contractorUserId: job.contractorUserId,
        jobPosterUserId: job.jobPosterUserId,
      },
      { tx },
    );

    const refreshed = await tx
      .select({
        status: jobs.status,
        appointmentAt: jobs.appointment_at,
        completedAt: jobs.completed_at,
        contractorMarkedCompleteAt: jobs.contractor_marked_complete_at,
        posterMarkedCompleteAt: jobs.poster_marked_complete_at,
        contractorCompletedAt: jobs.contractor_completed_at,
        customerApprovedAt: jobs.customer_approved_at,
      })
      .from(jobs)
      .where(eq(jobs.id, input.jobId))
      .limit(1);
    const current = refreshed[0] ?? null;
    if (!current) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");

    const now = new Date();
    if (!(current.appointmentAt instanceof Date) || now.getTime() < current.appointmentAt.getTime()) {
      throw conflict("V4_APPOINTMENT_NOT_REACHED", "Cannot mark complete before appointment time");
    }
    if (current.completedAt instanceof Date || isExecutionFinalStatus(current.status)) {
      return { ok: true as const, idempotent: true, finalized: true };
    }
    if (!["JOB_STARTED", "IN_PROGRESS"].includes(normalizeExecutionStatus(current.status))) {
      throw conflict("V4_JOB_NOT_STARTED", "Job must be started before marking completion");
    }
    if (current.posterMarkedCompleteAt instanceof Date) {
      return { ok: true as const, idempotent: true, finalized: Boolean(current.contractorMarkedCompleteAt) };
    }

    await tx
      .update(jobs)
      .set({
        poster_marked_complete_at: now,
        customer_approved_at: current.customerApprovedAt ?? now,
        status: normalizeExecutionStatus(current.status) === "IN_PROGRESS" ? ("JOB_STARTED" as any) : (current.status as any),
        updated_at: now,
      })
      .where(eq(jobs.id, input.jobId));

    await tx.insert(v4EventOutbox).values({
      id: randomUUID(),
      eventType: "POSTER_MARKED_COMPLETE",
      payload: {
        jobId: input.jobId,
        contractorId: job.contractorUserId ? String(job.contractorUserId) : null,
        jobPosterId: input.jobPosterUserId,
        createdAt: now.toISOString(),
        dedupeKeyBase: `poster_marked_complete:${input.jobId}`,
      } as Record<string, unknown>,
      createdAt: now,
    });

    const finalized = await finalizeCompletionIfBothMarked(tx, {
      jobId: input.jobId,
      now,
      contractorMarkedCompleteAt: current.contractorMarkedCompleteAt,
      posterMarkedCompleteAt: now,
      contractorUserId: job.contractorUserId ? String(job.contractorUserId) : null,
      jobPosterUserId: input.jobPosterUserId,
      routerUserId: job.routerUserId ? String(job.routerUserId) : null,
    });

    if (finalized.finalized && job.contractorUserId) {
      const assignmentRows = await tx
        .select({ id: v4JobAssignments.id, status: v4JobAssignments.status })
        .from(v4JobAssignments)
        .where(
          and(
            eq(v4JobAssignments.jobId, input.jobId),
            eq(v4JobAssignments.contractorUserId, job.contractorUserId),
          ),
        )
        .limit(1);
      const assignment = assignmentRows[0];
      if (assignment && assignment.status !== "COMPLETED") {
        await tx
          .update(v4JobAssignments)
          .set({ status: "COMPLETED" })
          .where(eq(v4JobAssignments.id, assignment.id));
      }
    }

    return { ok: true as const, idempotent: false, finalized: finalized.finalized };
  });
}

export async function getExecutionEligibilityForJob(jobId: string, tx?: Executor): Promise<ExecutionEligibility | null> {
  const exec = tx ?? db;
  const rows = await exec
    .select({
      id: jobs.id,
      status: jobs.status,
      appointment_at: jobs.appointment_at,
      completed_at: jobs.completed_at,
      contractor_marked_complete_at: jobs.contractor_marked_complete_at,
      poster_marked_complete_at: jobs.poster_marked_complete_at,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  const row = rows[0] ?? null;
  if (!row) return null;
  return computeExecutionEligibility(row as ExecutionJobRow);
}

export { computeExecutionEligibility, isExecutionFinalStatus, mapLegacyStatusForExecution, shouldAutoTransitionToJobStarted };
