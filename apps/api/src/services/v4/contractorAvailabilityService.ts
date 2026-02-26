import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4ContractorAvailabilitySubmissions } from "@/db/schema/v4ContractorAvailabilitySubmission";
import { v4JobAssignments } from "@/db/schema/v4JobAssignment";
import { badRequest } from "./v4Errors";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Submit availability for a job. Must submit within 7 calendar days of assignment (v1 simplification).
 * - Within 7 days: allowed
 * - At exactly 7 days (elapsedMs === SEVEN_DAYS_MS): allowed
 * - After 7 days (elapsedMs > SEVEN_DAYS_MS): V4_AVAILABILITY_DEADLINE_PASSED (400, not 500)
 */
export async function submitAvailability(
  contractorUserId: string,
  jobId: string,
  availabilityJson: unknown
) {
  const assignmentRows = await db
    .select({ assignedAt: v4JobAssignments.assignedAt })
    .from(v4JobAssignments)
    .where(
      and(
        eq(v4JobAssignments.contractorUserId, contractorUserId),
        eq(v4JobAssignments.jobId, jobId)
      )
    )
    .limit(1);
  const assignment = assignmentRows[0] ?? null;
  if (!assignment) throw badRequest("V4_JOB_NOT_ASSIGNED", "Job not assigned to you");

  const now = new Date();
  const assignedAt = assignment.assignedAt;
  const elapsedMs = now.getTime() - assignedAt.getTime();
  if (elapsedMs > SEVEN_DAYS_MS) {
    throw badRequest("V4_AVAILABILITY_DEADLINE_PASSED", "Availability must be submitted within 7 calendar days of assignment");
  }

  const json = typeof availabilityJson === "string" ? JSON.parse(availabilityJson) : availabilityJson;
  if (!json || typeof json !== "object") {
    throw badRequest("V4_INVALID_AVAILABILITY", "availabilityJson must be a valid JSON object");
  }

  await db.insert(v4ContractorAvailabilitySubmissions).values({
    id: randomUUID(),
    jobId,
    contractorUserId,
    availabilityJson: json as any,
    submittedAt: now,
  });
}
