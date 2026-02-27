import { and, eq, inArray } from "drizzle-orm";
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
