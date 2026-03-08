import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4JobAssignments } from "@/db/schema/v4JobAssignment";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";
import { badRequest, conflict } from "./v4Errors";
import {
  applyJobStartedTransitionIfDue,
  contractorMarkComplete,
  promoteDuePublishedJobsForContractor,
} from "./jobExecutionService";

/** V4 assignment status transitions. Lifecycle authority: v4_job_assignments only. */
export const V4_ASSIGNMENT_TRANSITIONS = {
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
} as const;

export type JobListStatus = "assigned" | "completed";

const ACTIVE_JOB_STATUSES = ["ASSIGNED", "JOB_STARTED", "IN_PROGRESS"] as const;

/**
 * List jobs by tab. Filters on jobs.status (source of truth), not assignment status.
 * v4_job_assignments is left-joined only to retrieve assignedAt for display.
 */
export async function listJobs(contractorUserId: string, status: JobListStatus) {
  await promoteDuePublishedJobsForContractor(contractorUserId);

  const whereClause =
    status === "assigned"
      ? and(
          eq(jobs.contractor_user_id, contractorUserId),
          inArray(jobs.status, ACTIVE_JOB_STATUSES as any),
        )
      : and(
          eq(jobs.contractor_user_id, contractorUserId),
          eq(jobs.status, "COMPLETED" as any),
          isNotNull(jobs.completed_at),
        );

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      scope: jobs.scope,
      region: jobs.region,
      status: jobs.status,
      appointment_at: jobs.appointment_at,
      completed_at: jobs.completed_at,
      contractor_marked_complete_at: jobs.contractor_marked_complete_at,
      poster_marked_complete_at: jobs.poster_marked_complete_at,
      payout_status: jobs.payout_status,
      contractor_payout_cents: jobs.contractor_payout_cents,
      created_at: jobs.created_at,
      assignedAt: v4JobAssignments.assignedAt,
    })
    .from(jobs)
    .leftJoin(
      v4JobAssignments,
      and(
        eq(v4JobAssignments.jobId, jobs.id),
        eq(v4JobAssignments.contractorUserId, contractorUserId),
      ),
    )
    .where(whereClause);

  return rows.map((r) => ({
    job: r,
    assignmentStatus: String(r.status ?? ""),
    assignedAt: r.assignedAt ?? r.created_at,
  }));
}

/**
 * Returns both tab lists in a single query pass. Preferred for the jobs page.
 * Assigned: jobs.status IN ('ASSIGNED','JOB_STARTED','IN_PROGRESS')
 * Completed: jobs.status = 'COMPLETED' AND completed_at IS NOT NULL
 */
export async function listJobsBothTabs(contractorUserId: string) {
  await promoteDuePublishedJobsForContractor(contractorUserId);

  const [assignedRows, completedRows] = await Promise.all([
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        scope: jobs.scope,
        region: jobs.region,
        status: jobs.status,
        appointment_at: jobs.appointment_at,
        completed_at: jobs.completed_at,
        contractor_marked_complete_at: jobs.contractor_marked_complete_at,
        poster_marked_complete_at: jobs.poster_marked_complete_at,
        created_at: jobs.created_at,
        assignedAt: v4JobAssignments.assignedAt,
      })
      .from(jobs)
      .leftJoin(
        v4JobAssignments,
        and(
          eq(v4JobAssignments.jobId, jobs.id),
          eq(v4JobAssignments.contractorUserId, contractorUserId),
        ),
      )
      .where(
        and(
          eq(jobs.contractor_user_id, contractorUserId),
          inArray(jobs.status, ACTIVE_JOB_STATUSES as any),
        ),
      ),
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        scope: jobs.scope,
        region: jobs.region,
        status: jobs.status,
        completed_at: jobs.completed_at,
        contractor_marked_complete_at: jobs.contractor_marked_complete_at,
        poster_marked_complete_at: jobs.poster_marked_complete_at,
        payout_status: jobs.payout_status,
        contractor_payout_cents: jobs.contractor_payout_cents,
        created_at: jobs.created_at,
        assignedAt: v4JobAssignments.assignedAt,
      })
      .from(jobs)
      .leftJoin(
        v4JobAssignments,
        and(
          eq(v4JobAssignments.jobId, jobs.id),
          eq(v4JobAssignments.contractorUserId, contractorUserId),
        ),
      )
      .where(
        and(
          eq(jobs.contractor_user_id, contractorUserId),
          eq(jobs.status, "COMPLETED" as any),
          isNotNull(jobs.completed_at),
        ),
      ),
  ]);

  return { assignedRows, completedRows };
}

export async function getJobById(contractorUserId: string, jobId: string) {
  await promoteDuePublishedJobsForContractor(contractorUserId);
  const assignmentRows = await db
    .select()
    .from(v4JobAssignments)
    .where(
      and(
        eq(v4JobAssignments.contractorUserId, contractorUserId),
        eq(v4JobAssignments.jobId, jobId)
      )
    )
    .limit(1);
  const assignment = assignmentRows[0] ?? null;
  if (!assignment) throw badRequest("V4_JOB_NOT_FOUND", "Job not found or not assigned to you");

  const jobRows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = jobRows[0] ?? null;
  if (!job) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");

  return { job, assignment };
}

/**
 * Transition ASSIGNED → IN_PROGRESS. Idempotent: if already IN_PROGRESS, returns ok.
 * Only assigned contractor may transition. No legacy tables written.
 */
export async function startJob(contractorUserId: string, jobId: string) {
  const assignmentRows = await db
    .select()
    .from(v4JobAssignments)
    .where(
      and(
        eq(v4JobAssignments.contractorUserId, contractorUserId),
        eq(v4JobAssignments.jobId, jobId)
      )
    )
    .limit(1);
  const assignment = assignmentRows[0] ?? null;
  if (!assignment) throw badRequest("V4_JOB_NOT_ASSIGNED_TO_CONTRACTOR", "Job not assigned to you");

  const allowed =
    V4_ASSIGNMENT_TRANSITIONS[assignment.status as keyof typeof V4_ASSIGNMENT_TRANSITIONS] as readonly string[];
  if (!allowed?.includes("IN_PROGRESS")) {
    if (assignment.status === "IN_PROGRESS") {
      return; // Idempotent: already started
    }
    throw conflict("V4_INVALID_STATUS_TRANSITION", `Cannot start from ${assignment.status}`, {
      currentStatus: assignment.status,
      allowedTransitions: allowed ?? [],
    });
  }

  await db.transaction(async (tx) => {
    const jobRows = await tx
      .select({
        id: jobs.id,
        status: jobs.status,
        appointmentAt: jobs.appointment_at,
        contractorUserId: jobs.contractor_user_id,
        jobPosterUserId: jobs.job_poster_user_id,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
    if (String(job.contractorUserId ?? "") !== contractorUserId) {
      throw badRequest("V4_JOB_NOT_ASSIGNED_TO_CONTRACTOR", "Job not assigned to you");
    }

    const promoted = await applyJobStartedTransitionIfDue(
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
    if (!promoted && (!(job.appointmentAt instanceof Date) || job.appointmentAt.getTime() > Date.now())) {
      throw conflict("V4_APPOINTMENT_NOT_REACHED", "Cannot start job before appointment time");
    }

    await tx
      .update(v4JobAssignments)
      .set({ status: "IN_PROGRESS" })
      .where(eq(v4JobAssignments.id, assignment.id));
    await tx
      .update(jobs)
      .set({ status: "JOB_STARTED" as any, updated_at: new Date() })
      .where(eq(jobs.id, jobId));
  });
}

/**
 * Transition IN_PROGRESS → COMPLETED. Idempotent: if already COMPLETED, returns ok.
 * Only assigned contractor may transition. No legacy tables written.
 */
export async function completeJob(contractorUserId: string, jobId: string) {
  await contractorMarkComplete({ contractorUserId, jobId });
}

export async function bookAppointment(contractorUserId: string, jobId: string, appointmentAtRaw: string) {
  const appointmentAt = new Date(String(appointmentAtRaw ?? ""));
  if (Number.isNaN(appointmentAt.getTime())) {
    throw badRequest("V4_INVALID_APPOINTMENT", "appointmentAt must be a valid ISO timestamp");
  }

  const now = new Date();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from jobs where id = ${jobId} for update`);

    const assignmentRows = await tx
      .select()
      .from(v4JobAssignments)
      .where(
        and(
          eq(v4JobAssignments.contractorUserId, contractorUserId),
          eq(v4JobAssignments.jobId, jobId),
        ),
      )
      .limit(1);
    const assignment = assignmentRows[0] ?? null;
    if (!assignment) throw badRequest("V4_JOB_NOT_ASSIGNED_TO_CONTRACTOR", "Job not assigned to you");
    if (String(assignment.status ?? "").toUpperCase() !== "ASSIGNED") {
      throw conflict("V4_JOB_NOT_ASSIGNABLE", "Job must be ASSIGNED before booking appointment");
    }

    const jobRows = await tx
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
    if (!job) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
    if (String(job.status ?? "").toUpperCase() !== "ASSIGNED") {
      throw conflict("V4_JOB_NOT_ASSIGNABLE", "Job must be ASSIGNED before booking appointment");
    }
    if (String(job.contractorUserId ?? "") !== contractorUserId) {
      throw badRequest("V4_JOB_NOT_ASSIGNED_TO_CONTRACTOR", "Job not assigned to you");
    }

    const updatedRows = await tx
      .update(jobs)
      .set({
        status: "PUBLISHED" as any,
        appointment_at: appointmentAt,
        appointment_published_at: now,
        appointment_accepted_at: null,
        poster_accept_expires_at: null,
        updated_at: now,
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, "ASSIGNED")))
      .returning({ id: jobs.id });
    if (updatedRows.length !== 1) {
      throw conflict("V4_JOB_NOT_ASSIGNABLE", "Job must be ASSIGNED before booking appointment");
    }

    if (job.jobPosterUserId) {
      await emitDomainEvent(
        {
          type: "APPOINTMENT_BOOKED",
          payload: {
            jobId,
            jobPosterId: String(job.jobPosterUserId),
            createdAt: now,
            dedupeKey: `appointment_booked:${jobId}:poster`,
          },
        },
        { tx },
      );
    }

    return { success: true as const, jobId, appointmentAt: appointmentAt.toISOString(), publishedAt: now.toISOString() };
  });
}

async function notifyCancellationActors(
  tx: any,
  input: { jobId: string; now: Date; jobPosterUserId: string | null; routerUserId: string | null; type: string; message: string },
) {
  await emitDomainEvent(
    {
      type: "CONTRACTOR_CANCELLED",
      payload: {
        jobId: input.jobId,
        jobPosterId: input.jobPosterUserId ? String(input.jobPosterUserId) : null,
        routerId: input.routerUserId ? String(input.routerUserId) : null,
        message: input.message,
        createdAt: input.now,
        dedupeKeyBase: `${input.type.toLowerCase()}:${input.jobId}`,
      },
    },
    { tx },
  );
}

export async function rescheduleAppointment(contractorUserId: string, jobId: string, appointmentAtRaw: string) {
  const nextAppointmentAt = new Date(String(appointmentAtRaw ?? ""));
  if (Number.isNaN(nextAppointmentAt.getTime())) {
    throw badRequest("V4_INVALID_APPOINTMENT", "appointmentAt must be a valid ISO timestamp");
  }

  const now = new Date();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from jobs where id = ${jobId} for update`);

    const assignmentRows = await tx
      .select()
      .from(v4JobAssignments)
      .where(
        and(
          eq(v4JobAssignments.contractorUserId, contractorUserId),
          eq(v4JobAssignments.jobId, jobId),
          eq(v4JobAssignments.status, "ASSIGNED"),
        ),
      )
      .limit(1);
    if (!assignmentRows[0]) throw badRequest("V4_JOB_NOT_ASSIGNED_TO_CONTRACTOR", "Job not assigned to you");

    const jobRows = await tx
      .select({
        id: jobs.id,
        status: jobs.status,
        contractorUserId: jobs.contractor_user_id,
        appointmentAt: jobs.appointment_at,
        jobPosterUserId: jobs.job_poster_user_id,
        routerUserId: jobs.claimed_by_user_id,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
    if (String(job.contractorUserId ?? "") !== contractorUserId) {
      throw badRequest("V4_JOB_NOT_ASSIGNED_TO_CONTRACTOR", "Job not assigned to you");
    }
    if (!(job.appointmentAt instanceof Date)) {
      throw conflict("V4_APPOINTMENT_NOT_BOOKED", "Appointment must be booked before rescheduling");
    }

    const hoursUntilAppointment = (job.appointmentAt.getTime() - now.getTime()) / (60 * 60 * 1000);
    if (hoursUntilAppointment <= 8) {
      await reopenRoutingAndUnassign(tx, {
        jobId,
        contractorUserId,
        now,
        reason: "CONTRACTOR_REJECTED",
      });
      await notifyCancellationActors(tx, {
        jobId,
        now,
        jobPosterUserId: String(job.jobPosterUserId ?? "") || null,
        routerUserId: String(job.routerUserId ?? "") || null,
        type: "CONTRACTOR_CANCELLED",
        message: "Contractor cancelled within 8 hours; the job returned to routing.",
      });
      return { success: true as const, action: "UNASSIGNED_AND_REOPENED" as const };
    }

    const normalizedStatus = String(job.status ?? "").toUpperCase();
    if (!["ASSIGNED", "PUBLISHED"].includes(normalizedStatus)) {
      throw conflict("V4_JOB_NOT_ASSIGNABLE", "Job is not in a schedulable state");
    }

    await tx
      .update(jobs)
      .set({
        status: "PUBLISHED" as any,
        appointment_at: nextAppointmentAt,
        appointment_published_at: now,
        appointment_accepted_at: null,
        updated_at: now,
      })
      .where(eq(jobs.id, jobId));

    if (job.jobPosterUserId) {
      await emitDomainEvent(
        {
          type: "RESCHEDULE_REQUESTED",
          payload: {
            jobId,
            jobPosterId: String(job.jobPosterUserId),
            appointmentAt: nextAppointmentAt.toISOString(),
            createdAt: now,
            dedupeKey: `reschedule_request:${jobId}:${nextAppointmentAt.toISOString()}:poster`,
          },
        },
        { tx },
      );
    }

    return {
      success: true as const,
      jobId,
      action: "RESCHEDULED" as const,
      appointmentAt: nextAppointmentAt.toISOString(),
    };
  });
}

export async function cancelAssignedJob(contractorUserId: string, jobId: string) {
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from jobs where id = ${jobId} for update`);

    const assignmentRows = await tx
      .select()
      .from(v4JobAssignments)
      .where(
        and(
          eq(v4JobAssignments.contractorUserId, contractorUserId),
          eq(v4JobAssignments.jobId, jobId),
          eq(v4JobAssignments.status, "ASSIGNED"),
        ),
      )
      .limit(1);
    if (!assignmentRows[0]) throw badRequest("V4_JOB_NOT_ASSIGNED_TO_CONTRACTOR", "Job not assigned to you");

    const jobRows = await tx
      .select({
        contractorUserId: jobs.contractor_user_id,
        jobPosterUserId: jobs.job_poster_user_id,
        routerUserId: jobs.claimed_by_user_id,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    if (!jobRows[0]) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
    if (String(jobRows[0].contractorUserId ?? "") !== contractorUserId) {
      throw badRequest("V4_JOB_NOT_ASSIGNED_TO_CONTRACTOR", "Job not assigned to you");
    }

    await reopenRoutingAndUnassign(tx, {
      jobId,
      contractorUserId,
      now,
      reason: "CONTRACTOR_REJECTED",
    });
    await notifyCancellationActors(tx, {
      jobId,
      now,
      jobPosterUserId: String(jobRows[0].jobPosterUserId ?? "") || null,
      routerUserId: String(jobRows[0].routerUserId ?? "") || null,
      type: "CONTRACTOR_CANCELLED",
      message: "Contractor cancelled the assignment and the job returned to routing.",
    });

    return { success: true as const, action: "UNASSIGNED_AND_REOPENED" as const };
  });
}

async function reopenRoutingAndUnassign(
  tx: any,
  input: { jobId: string; contractorUserId: string; now: Date; reason: string },
) {
  await tx
    .delete(v4JobAssignments)
    .where(and(eq(v4JobAssignments.jobId, input.jobId), eq(v4JobAssignments.contractorUserId, input.contractorUserId)));

  await tx
    .update(jobs)
    .set({
      status: "OPEN_FOR_ROUTING" as any,
      routing_status: "UNROUTED" as any,
      contractor_user_id: null,
      appointment_at: null,
      appointment_published_at: null,
      appointment_accepted_at: null,
      poster_accept_expires_at: null,
      poster_accepted_at: null,
      completion_flag_reason: input.reason,
      updated_at: input.now,
    })
    .where(eq(jobs.id, input.jobId));
}
