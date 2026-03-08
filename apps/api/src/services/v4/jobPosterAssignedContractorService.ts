import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { mapLegacyStatusForExecution } from "./jobExecutionService";

export type AssignedContractorPayload = {
  id: string;
  jobId: string;
  jobTitle: string | null;
  jobStatus: string;
  contractorName: string | null;
  contractorBusinessName: string | null;
  appointmentAt: string | null;
  appointmentAcceptedAt: string | null;
};

/** Read-only. No mutations, no promote-due. */
export async function getAssignedContractorForJobPoster(userId: string): Promise<AssignedContractorPayload | null> {
  try {
    const rows = await db
      .select({
        jobId: jobs.id,
        jobTitle: jobs.title,
        jobStatus: jobs.status,
        appointmentAt: jobs.appointment_at,
        appointmentAcceptedAt: jobs.appointment_accepted_at,
        contractorName: contractorProfilesV4.contactName,
        contractorBusinessName: contractorProfilesV4.businessName,
      })
      .from(jobs)
      .leftJoin(contractorProfilesV4, eq(contractorProfilesV4.userId, jobs.contractor_user_id))
      .leftJoin(contractorAccounts, eq(contractorAccounts.userId, jobs.contractor_user_id))
      .where(
        and(
          eq(jobs.job_poster_user_id, userId),
          isNotNull(jobs.contractor_user_id),
          inArray(jobs.status, ["ASSIGNED", "PUBLISHED", "JOB_STARTED", "IN_PROGRESS", "CONTRACTOR_COMPLETED"]),
        ),
      )
      .orderBy(desc(jobs.appointment_at), desc(jobs.updated_at), desc(jobs.created_at))
      .limit(1);

    const top = rows[0];
    if (!top) return null;

    return {
      id: top.jobId,
      jobId: top.jobId,
      jobTitle: top.jobTitle ?? null,
      jobStatus: mapLegacyStatusForExecution(String(top.jobStatus ?? "")),
      contractorName: top.contractorName ?? null,
      contractorBusinessName: top.contractorBusinessName ?? null,
      appointmentAt: top.appointmentAt?.toISOString?.() ?? null,
      appointmentAcceptedAt: top.appointmentAcceptedAt?.toISOString?.() ?? null,
    };
  } catch {
    return null;
  }
}
