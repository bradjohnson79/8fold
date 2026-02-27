import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";
import { v4JobAssignments } from "@/db/schema/v4JobAssignment";
import { jobs } from "@/db/schema/job";
import { v4MessageThreads } from "@/db/schema/v4MessageThread";
import { v4Notifications } from "@/db/schema/v4Notification";
import { badRequest, conflict, forbidden } from "./v4Errors";
import { isContractorStripeConnectReady } from "@/src/services/stripeConnectService";

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

  const paymentReady = await isContractorStripeConnectReady(contractorUserId);
  return { invites: rows, paymentReady };
}

export async function getInviteByJob(contractorUserId: string, jobId: string) {
  const rows = await db
    .select()
    .from(v4ContractorJobInvites)
    .where(
      and(
        eq(v4ContractorJobInvites.contractorUserId, contractorUserId),
        eq(v4ContractorJobInvites.jobId, jobId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
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
    const paymentReady = await isContractorStripeConnectReady(contractorUserId);
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

    const existingAssignment = await tx
      .select({ id: v4JobAssignments.id })
      .from(v4JobAssignments)
      .where(
        and(
          eq(v4JobAssignments.jobId, jobId),
          eq(v4JobAssignments.contractorUserId, contractorUserId)
        )
      )
      .limit(1);
    if (existingAssignment.length > 0) {
      throw conflict("V4_ASSIGNMENT_ALREADY_EXISTS", "Assignment already exists for this job");
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
          eq(v4MessageThreads.contractorUserId, contractorUserId)
        )
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
