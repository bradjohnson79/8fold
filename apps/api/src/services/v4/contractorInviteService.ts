import { randomUUID } from "crypto";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { jobs } from "@/db/schema/job";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";
import { v4JobAssignments } from "@/db/schema/v4JobAssignment";
import { v4MessageThreads } from "@/db/schema/v4MessageThread";
import { sendBulkNotifications, sendNotification } from "@/src/services/v4/notifications/notificationService";
import { badRequest, conflict, forbidden } from "./v4Errors";
import { expireStaleInvitesAndResetJobs } from "./inviteExpirationService";

export type PendingInviteDto = {
  inviteId: string;
  jobId: string;
  jobTitle: string;
  jobDescription: string;
  jobPosterFirstName: string;
  jobPosterLastName: string;
  tradeCategory: string;
  availability: string;
  contractorAmount: number;
  address: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  expiresAt: string;
};

function toNonEmpty(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function toAvailability(raw: unknown, timeWindow: string | null | undefined): string {
  const fromWindow = toNonEmpty(timeWindow);
  if (fromWindow) return fromWindow;
  if (typeof raw === "string") return toNonEmpty(raw);
  if (raw == null) return "";
  try {
    return JSON.stringify(raw);
  } catch {
    return "";
  }
}

function computeContractorAmountCents(input: {
  contractorPayoutCents: number | null;
  totalAmountCents: number | null;
  amountCents: number | null;
}): number {
  const contractorPayoutCents = Number(input.contractorPayoutCents ?? 0);
  if (contractorPayoutCents > 0) return contractorPayoutCents;
  const total = Math.max(Number(input.totalAmountCents ?? 0), Number(input.amountCents ?? 0), 0);
  return Math.round(total * 0.75);
}

export async function countPendingInvites(contractorUserId: string): Promise<number> {
  await expireStaleInvitesAndResetJobs();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(v4ContractorJobInvites)
    .where(
      and(
        eq(v4ContractorJobInvites.contractorUserId, contractorUserId),
        eq(v4ContractorJobInvites.status, "PENDING"),
        sql`${v4ContractorJobInvites.expiresAt} > now()`,
      ),
    )
    .limit(1);
  return Number(rows[0]?.count ?? 0);
}

export async function listPendingInvites(contractorUserId: string): Promise<PendingInviteDto[]> {
  await expireStaleInvitesAndResetJobs();
  const rows = await db
    .select({
      inviteId: v4ContractorJobInvites.id,
      jobId: v4ContractorJobInvites.jobId,
      createdAt: v4ContractorJobInvites.createdAt,
      expiresAt: v4ContractorJobInvites.expiresAt,
      title: jobs.title,
      scope: jobs.scope,
      tradeCategory: jobs.trade_category,
      availability: jobs.availability,
      timeWindow: jobs.time_window,
      contractorPayoutCents: jobs.contractor_payout_cents,
      totalAmountCents: jobs.total_amount_cents,
      amountCents: jobs.amount_cents,
      addressFull: jobs.address_full,
      city: jobs.city,
      region: jobs.region,
      lat: jobs.lat,
      lng: jobs.lng,
      jobPosterFirstName: jobPosterProfilesV4.firstName,
      jobPosterLastName: jobPosterProfilesV4.lastName,
    })
    .from(v4ContractorJobInvites)
    .innerJoin(jobs, eq(jobs.id, v4ContractorJobInvites.jobId))
    .leftJoin(jobPosterProfilesV4, eq(jobPosterProfilesV4.userId, jobs.job_poster_user_id))
    .where(
      and(
        eq(v4ContractorJobInvites.contractorUserId, contractorUserId),
        eq(v4ContractorJobInvites.status, "PENDING"),
        sql`${v4ContractorJobInvites.expiresAt} > now()`,
      ),
    )
    .orderBy(desc(v4ContractorJobInvites.createdAt));

  return rows.map((row) => {
    const fallbackAddress = [toNonEmpty(row.city), toNonEmpty(row.region)].filter(Boolean).join(", ");
    return {
      inviteId: row.inviteId,
      jobId: row.jobId,
      jobTitle: toNonEmpty(row.title) || "Job",
      jobDescription: toNonEmpty(row.scope),
      jobPosterFirstName: toNonEmpty(row.jobPosterFirstName),
      jobPosterLastName: toNonEmpty(row.jobPosterLastName),
      tradeCategory: toNonEmpty(row.tradeCategory),
      availability: toAvailability(row.availability, row.timeWindow),
      contractorAmount: computeContractorAmountCents({
        contractorPayoutCents: row.contractorPayoutCents,
        totalAmountCents: row.totalAmountCents,
        amountCents: row.amountCents,
      }),
      address: toNonEmpty(row.addressFull) || fallbackAddress,
      latitude: typeof row.lat === "number" && Number.isFinite(row.lat) ? row.lat : null,
      longitude: typeof row.lng === "number" && Number.isFinite(row.lng) ? row.lng : null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  });
}

// Backward-compatible shape consumed by legacy UI.
export async function listInvites(contractorUserId: string): Promise<{ invites: PendingInviteDto[]; paymentReady: boolean }> {
  const invites = await listPendingInvites(contractorUserId);
  return { invites, paymentReady: true };
}

export async function getInviteByJob(contractorUserId: string, jobId: string) {
  await expireStaleInvitesAndResetJobs();
  const rows = await db
    .select()
    .from(v4ContractorJobInvites)
    .where(
      and(
        eq(v4ContractorJobInvites.contractorUserId, contractorUserId),
        eq(v4ContractorJobInvites.jobId, jobId),
        sql`${v4ContractorJobInvites.expiresAt} > now()`,
      ),
    )
    .orderBy(desc(v4ContractorJobInvites.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function acceptInviteById(contractorUserId: string, inviteId: string): Promise<{ success: true; jobId: string }> {
  const inviteRows = await db.select().from(v4ContractorJobInvites).where(eq(v4ContractorJobInvites.id, inviteId)).limit(1);
  const invite = inviteRows[0] ?? null;
  if (!invite) throw badRequest("V4_INVITE_NOT_FOUND", "Invite not found");
  if (invite.contractorUserId !== contractorUserId) throw forbidden("V4_INVITE_FORBIDDEN", "Invite does not belong to you");

  const now = new Date();
  const posterAcceptExpiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from jobs where id = ${invite.jobId} for update`);
    await tx.execute(sql`select id from v4_contractor_job_invites where id = ${inviteId} for update`);

    const inviteAfterLockRows = await tx
      .select()
      .from(v4ContractorJobInvites)
      .where(eq(v4ContractorJobInvites.id, inviteId))
      .limit(1);
    const inviteAfterLock = inviteAfterLockRows[0] ?? null;
    if (!inviteAfterLock) throw badRequest("V4_INVITE_NOT_FOUND", "Invite not found");
    if (inviteAfterLock.contractorUserId !== contractorUserId) throw forbidden("V4_INVITE_FORBIDDEN", "Invite does not belong to you");
    if (inviteAfterLock.status !== "PENDING") throw conflict("V4_INVITE_ALREADY_RESPONDED", "Invite already responded");
    if (inviteAfterLock.expiresAt.getTime() <= now.getTime()) {
      await tx
        .update(v4ContractorJobInvites)
        .set({ status: "EXPIRED", respondedAt: now })
        .where(and(eq(v4ContractorJobInvites.id, inviteId), eq(v4ContractorJobInvites.status, "PENDING")));
      throw conflict("V4_INVITE_EXPIRED", "This invite has expired.");
    }

    const jobRows = await tx
      .select({
        id: jobs.id,
        status: jobs.status,
        jobPosterUserId: jobs.job_poster_user_id,
        routerUserId: jobs.claimed_by_user_id,
      })
      .from(jobs)
      .where(eq(jobs.id, inviteAfterLock.jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
    if (job.status === "ASSIGNED") throw conflict("V4_JOB_ALREADY_ASSIGNED", "Job is already assigned");
    if (String(job.status ?? "").toUpperCase() !== "INVITED") {
      throw conflict("V4_JOB_NOT_ASSIGNABLE", "Job is no longer available for assignment");
    }
    if (!job.jobPosterUserId) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");

    const accepted = await tx
      .update(v4ContractorJobInvites)
      .set({ status: "ACCEPTED", respondedAt: now })
      .where(and(eq(v4ContractorJobInvites.id, inviteId), eq(v4ContractorJobInvites.status, "PENDING")))
      .returning({ id: v4ContractorJobInvites.id });
    if (accepted.length !== 1) throw conflict("V4_INVITE_ALREADY_RESPONDED", "Invite already responded");

    await tx
      .update(v4ContractorJobInvites)
      .set({ status: "EXPIRED", respondedAt: now })
      .where(
        and(
          eq(v4ContractorJobInvites.jobId, inviteAfterLock.jobId),
          ne(v4ContractorJobInvites.id, inviteId),
          eq(v4ContractorJobInvites.status, "PENDING"),
        ),
      );

    const assignmentRows = await tx
      .select({ id: v4JobAssignments.id })
      .from(v4JobAssignments)
      .where(eq(v4JobAssignments.jobId, inviteAfterLock.jobId))
      .limit(1);
    if (assignmentRows.length > 0) throw conflict("V4_JOB_ALREADY_ASSIGNED", "Job is already assigned");

    await tx.insert(v4JobAssignments).values({
      id: randomUUID(),
      jobId: inviteAfterLock.jobId,
      contractorUserId,
      status: "ASSIGNED",
      assignedAt: now,
    });

    const updatedJob = await tx
      .update(jobs)
      .set({
        status: "ASSIGNED" as any,
        contractor_user_id: contractorUserId,
        accepted_at: now,
        poster_accept_expires_at: posterAcceptExpiresAt,
        routing_started_at: null,
        routing_expires_at: null,
        updated_at: now,
      })
      .where(and(eq(jobs.id, inviteAfterLock.jobId), eq(jobs.status, "INVITED" as any)))
      .returning({ id: jobs.id });
    if (updatedJob.length !== 1) throw conflict("V4_JOB_ALREADY_ASSIGNED", "Job is already assigned");

    await tx
      .insert(v4MessageThreads)
      .values({
        id: randomUUID(),
        jobId: inviteAfterLock.jobId,
        jobPosterUserId: job.jobPosterUserId,
        contractorUserId,
        lastMessageAt: now,
        createdAt: now,
      })
      .onConflictDoNothing();

    await tx
      .update(v4MessageThreads)
      .set({ lastMessageAt: now })
      .where(
        and(
          eq(v4MessageThreads.jobId, inviteAfterLock.jobId),
          eq(v4MessageThreads.jobPosterUserId, job.jobPosterUserId),
          eq(v4MessageThreads.contractorUserId, contractorUserId),
        ),
      );

    const notifications = [
      {
        userId: contractorUserId,
        role: "CONTRACTOR",
        type: "JOB_ASSIGNED",
        title: "Job assigned",
        message: "You accepted the invite and are now assigned to this job.",
        entityType: "JOB",
        entityId: inviteAfterLock.jobId,
        priority: "NORMAL",
        createdAt: now,
        idempotencyKey: `job_assigned:${inviteAfterLock.jobId}:${contractorUserId}`,
      },
      {
        userId: String(job.jobPosterUserId),
        role: "JOB_POSTER",
        type: "CONTRACTOR_ACCEPTED",
        title: "Contractor accepted",
        message: "A contractor accepted your routed job invite.",
        entityType: "INVITE",
        entityId: inviteId,
        priority: "NORMAL",
        createdAt: now,
        idempotencyKey: `contractor_accepted:${inviteId}:poster`,
      },
    ] as const;
    await sendBulkNotifications(
      [
        ...notifications,
        ...(job.routerUserId
          ? [
              {
                userId: String(job.routerUserId),
                role: "ROUTER",
                type: "CONTRACTOR_ACCEPTED",
                title: "Contractor accepted",
                message: "A contractor accepted one of your routed invites.",
                entityType: "INVITE",
                entityId: inviteId,
                priority: "NORMAL",
                createdAt: now,
                idempotencyKey: `contractor_accepted:${inviteId}:router`,
              },
            ]
          : []),
      ],
      tx,
    );

    return { success: true as const, jobId: inviteAfterLock.jobId };
  });
}

export async function rejectInviteById(contractorUserId: string, inviteId: string): Promise<{ success: true }> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(v4ContractorJobInvites).where(eq(v4ContractorJobInvites.id, inviteId)).limit(1);
    const invite = rows[0] ?? null;
    if (!invite) throw badRequest("V4_INVITE_NOT_FOUND", "Invite not found");
    if (invite.contractorUserId !== contractorUserId) throw forbidden("V4_INVITE_FORBIDDEN", "Invite does not belong to you");
    if (invite.status !== "PENDING") throw conflict("V4_INVITE_ALREADY_RESPONDED", "Invite already responded");

    const updated = await tx
      .update(v4ContractorJobInvites)
      .set({ status: "REJECTED", respondedAt: now })
      .where(and(eq(v4ContractorJobInvites.id, inviteId), eq(v4ContractorJobInvites.status, "PENDING")))
      .returning({ id: v4ContractorJobInvites.id });
    if (updated.length !== 1) throw conflict("V4_INVITE_ALREADY_RESPONDED", "Invite already responded");

    const jobRows = await tx
      .select({
        jobPosterUserId: jobs.job_poster_user_id,
        routerUserId: jobs.claimed_by_user_id,
      })
      .from(jobs)
      .where(eq(jobs.id, invite.jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (job) {
      if (job.routerUserId) {
        await sendNotification(
          {
            userId: String(job.routerUserId),
            role: "ROUTER",
            type: "JOB_REJECTED",
            title: "Invite rejected",
            message: "A contractor rejected a routed invite.",
            entityType: "INVITE",
            entityId: inviteId,
            priority: "NORMAL",
            createdAt: now,
            idempotencyKey: `invite_rejected:${inviteId}:router`,
          },
          tx,
        );
      }
      if (job.jobPosterUserId) {
        await sendNotification(
          {
            userId: String(job.jobPosterUserId),
            role: "JOB_POSTER",
            type: "JOB_REJECTED",
            title: "Invite declined",
            message: "A contractor declined this job invite.",
            entityType: "INVITE",
            entityId: inviteId,
            priority: "LOW",
            createdAt: now,
            idempotencyKey: `invite_rejected:${inviteId}:poster`,
          },
          tx,
        );
      }
    }
    return { success: true as const };
  });
}

// Backward compatibility: legacy jobId endpoints delegate to inviteId flow.
export async function acceptInvite(contractorUserId: string, jobId: string) {
  const invite = await getInviteByJob(contractorUserId, jobId);
  if (!invite) throw badRequest("V4_INVITE_NOT_FOUND", "Invite not found");
  return acceptInviteById(contractorUserId, invite.id);
}

// Backward compatibility: legacy jobId endpoints delegate to inviteId flow.
export async function rejectInvite(contractorUserId: string, jobId: string) {
  const invite = await getInviteByJob(contractorUserId, jobId);
  if (!invite) throw badRequest("V4_INVITE_NOT_FOUND", "Invite not found");
  return rejectInviteById(contractorUserId, invite.id);
}
