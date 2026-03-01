import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4JobAssignments } from "@/db/schema/v4JobAssignment";
import { badRequest, conflict } from "./v4Errors";

/** V4 assignment status transitions. Lifecycle authority: v4_job_assignments only. */
export const V4_ASSIGNMENT_TRANSITIONS = {
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
} as const;

export type JobListStatus = "assigned" | "completed";

export async function listJobs(contractorUserId: string, status: JobListStatus) {
  const assignmentStatuses = status === "assigned" ? ["ASSIGNED", "IN_PROGRESS"] : ["COMPLETED"];
  const assignmentRows = await db
    .select({ jobId: v4JobAssignments.jobId, status: v4JobAssignments.status, assignedAt: v4JobAssignments.assignedAt })
    .from(v4JobAssignments)
    .where(
      and(
        eq(v4JobAssignments.contractorUserId, contractorUserId),
        inArray(v4JobAssignments.status, assignmentStatuses)
      )
    );

  if (assignmentRows.length === 0) return [];

  const jobIds = assignmentRows.map((r) => r.jobId);
  const jobRows = await db.select().from(jobs).where(inArray(jobs.id, jobIds));

  const jobMap = new Map(jobRows.map((j) => [j.id, j]));
  return assignmentRows
    .map((a) => {
      const job = jobMap.get(a.jobId);
      if (!job) return null;
      return { job, assignmentStatus: a.status, assignedAt: a.assignedAt };
    })
    .filter(Boolean) as { job: (typeof jobRows)[0]; assignmentStatus: string; assignedAt: Date }[];
}

export async function getJobById(contractorUserId: string, jobId: string) {
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
    await tx
      .update(v4JobAssignments)
      .set({ status: "IN_PROGRESS" })
      .where(eq(v4JobAssignments.id, assignment.id));
    await tx
      .update(jobs)
      .set({ status: "IN_PROGRESS" as any, updated_at: new Date() })
      .where(eq(jobs.id, jobId));
  });
}

/**
 * Transition IN_PROGRESS → COMPLETED. Idempotent: if already COMPLETED, returns ok.
 * Only assigned contractor may transition. No legacy tables written.
 */
export async function completeJob(contractorUserId: string, jobId: string) {
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
  if (!allowed?.includes("COMPLETED")) {
    if (assignment.status === "COMPLETED") {
      return; // Idempotent: already completed
    }
    throw conflict("V4_INVALID_STATUS_TRANSITION", `Cannot complete from ${assignment.status}`, {
      currentStatus: assignment.status,
      allowedTransitions: allowed ?? [],
    });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(v4JobAssignments)
      .set({ status: "COMPLETED" })
      .where(eq(v4JobAssignments.id, assignment.id));
    await tx
      .update(jobs)
      .set({ status: "COMPLETED" as any, contractor_completed_at: new Date(), updated_at: new Date() })
      .where(eq(jobs.id, jobId));
  });
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

    return {
      success: true as const,
      jobId,
      appointmentAt: appointmentAt.toISOString(),
      publishedAt: now.toISOString(),
    };
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

    return {
      success: true as const,
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
      .select({ contractorUserId: jobs.contractor_user_id })
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

    return { success: true as const, action: "UNASSIGNED_AND_REOPENED" as const };
  });
}
