import { randomUUID } from "crypto";
import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { jobs } from "@/db/schema/job";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";
import { v4EventOutbox } from "@/db/schema/v4EventOutbox";
import { v4JobAssignments } from "@/db/schema/v4JobAssignment";
import { v4MessageThreads } from "@/db/schema/v4MessageThread";
import { ROUTING_STATUS } from "@/src/router/routingStatus";
import { badRequest, conflict, forbidden, type V4Error } from "./v4Errors";
import { expireStaleInvitesAndResetJobs } from "./inviteExpirationService";

function isV4Error(err: unknown): err is V4Error {
  return err instanceof Error && "status" in err && typeof (err as any).status === "number";
}

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
  return Math.floor(total * 0.80);
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
  console.log("[invite-accept] starting", { inviteId, contractorUserId });
  const inviteRows = await db.select().from(v4ContractorJobInvites).where(eq(v4ContractorJobInvites.id, inviteId)).limit(1);
  const invite = inviteRows[0] ?? null;
  if (!invite) throw badRequest("V4_INVITE_NOT_FOUND", "Invite not found");
  console.log("[invite-accept] invite lookup ok", { jobId: invite.jobId });
  if (invite.contractorUserId !== contractorUserId) throw forbidden("V4_INVITE_FORBIDDEN", "Invite does not belong to you");

  const now = new Date();
  const posterAcceptExpiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  try {
  return await db.transaction(async (tx) => {
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
        routingStatus: jobs.routing_status,
        jobPosterUserId: jobs.job_poster_user_id,
        routerUserId: jobs.claimed_by_user_id,
      })
      .from(jobs)
      .where(eq(jobs.id, inviteAfterLock.jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");
    console.log("[invite-accept] job lookup ok", { status: job.status, routingStatus: job.routingStatus });
    if (job.status === "ASSIGNED") throw conflict("V4_JOB_ALREADY_ASSIGNED", "Job is already assigned");
    const status = String(job.status ?? "").toUpperCase();
    const routingStatus = String(job.routingStatus ?? "").toUpperCase();
    const assignable = status === "OPEN_FOR_ROUTING" && routingStatus === "INVITES_SENT";
    if (!assignable) {
      throw conflict("V4_JOB_NOT_ASSIGNABLE", "Job is no longer available for assignment");
    }
    if (!job.jobPosterUserId) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");

    console.log("[invite-accept] updating invite status");
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

    console.log("[invite-accept-step] assignment insert attempted", {
      jobId: inviteAfterLock.jobId,
      contractorUserId,
    });
    await tx
      .insert(v4JobAssignments)
      .values({
        id: randomUUID(),
        jobId: inviteAfterLock.jobId,
        contractorUserId,
        status: "ASSIGNED",
        assignedAt: now,
      })
      .onConflictDoNothing({
        target: [v4JobAssignments.jobId],
      });

    const assignmentCheck = await tx
      .select({ id: v4JobAssignments.id, contractorUserId: v4JobAssignments.contractorUserId })
      .from(v4JobAssignments)
      .where(eq(v4JobAssignments.jobId, inviteAfterLock.jobId))
      .limit(1);
    console.log("[invite-accept-step] assignment check", assignmentCheck);
    const assignment = assignmentCheck[0];
    if (!assignment || assignment.contractorUserId !== contractorUserId) {
      throw conflict("V4_JOB_ALREADY_ASSIGNED", "Job is already assigned");
    }

    const currentRow = await tx
      .select({
        id: jobs.id,
        status: jobs.status,
        routingStatus: jobs.routing_status,
        contractorUserId: jobs.contractor_user_id,
      })
      .from(jobs)
      .where(eq(jobs.id, inviteAfterLock.jobId))
      .limit(1);
    console.log("[invite-accept-step] job row before update", currentRow[0] ?? null);

    const nextRoutingStatus = ROUTING_STATUS.ROUTED_BY_ROUTER as string;
    const jobUpdatePayload = {
      status: "ASSIGNED" as any,
      contractor_user_id: contractorUserId,
      accepted_at: now,
      poster_accept_expires_at: posterAcceptExpiresAt instanceof Date ? posterAcceptExpiresAt : new Date(posterAcceptExpiresAt),
      routing_status: nextRoutingStatus as any,
      routing_started_at: null as Date | null,
      routing_expires_at: null as Date | null,
      updated_at: now,
    };
    console.log("[invite-accept-step] job update payload", {
      jobId: inviteAfterLock.jobId,
      nextStatus: "ASSIGNED",
      nextRoutingStatus: ROUTING_STATUS.ROUTED_BY_ROUTER,
      routing_started_at: null,
      routing_expires_at: null,
      poster_accept_expires_at: jobUpdatePayload.poster_accept_expires_at?.toISOString(),
    });

    const updatedJob = await tx
      .update(jobs)
      .set(jobUpdatePayload)
      .where(
        and(
          eq(jobs.id, inviteAfterLock.jobId),
          isNull(jobs.contractor_user_id),
        ),
      )
      .returning({ id: jobs.id });

    console.log("[invite-accept-step] job update result", { updatedRows: updatedJob.length });
    if (updatedJob.length === 0) {
      console.error("[invite-accept-step] job update mismatch", {
        jobId: inviteAfterLock.jobId,
        expectedStatus: ["OPEN_FOR_ROUTING + INVITES_SENT"],
        actualStatus: currentRow[0]?.status,
        actualRoutingStatus: currentRow[0]?.routingStatus,
        actualContractorUserId: currentRow[0]?.contractorUserId,
      });
    }
    if (updatedJob.length !== 1) throw conflict("V4_JOB_ALREADY_ASSIGNED", "Job is already assigned");
    console.log("[invite-accept] job update ok");
    console.log("[invite-accept-step] job updated", { jobId: inviteAfterLock.jobId });

    console.log("[invite-accept-step] before thread insert", {
      jobId: inviteAfterLock.jobId,
      jobPosterUserId: job.jobPosterUserId,
      contractorUserId,
    });
    try {
      await tx.execute(sql`SAVEPOINT thread_sp`);
      try {
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
          .onConflictDoNothing({
            target: [
              v4MessageThreads.jobId,
              v4MessageThreads.jobPosterUserId,
              v4MessageThreads.contractorUserId,
            ],
          });
        console.log("[invite-accept-step] after thread insert", { jobId: inviteAfterLock.jobId });
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
        console.log("[invite-accept-step] thread upserted", { jobId: inviteAfterLock.jobId });
      } catch (threadErr) {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT thread_sp`);
        console.error("[invite-accept-thread-error]", {
          jobId: inviteAfterLock.jobId,
          message: threadErr instanceof Error ? threadErr.message : String(threadErr),
          code: (threadErr as any)?.code,
        });
      }
    } catch (spErr) {
      console.error("[invite-accept-thread-savepoint-error]", {
        jobId: inviteAfterLock.jobId,
        message: spErr instanceof Error ? spErr.message : String(spErr),
      });
    }

    const acceptEvent = {
      type: "CONTRACTOR_ACCEPTED_INVITE" as const,
      payload: {
        jobId: inviteAfterLock.jobId,
        inviteId,
        contractorId: contractorUserId,
        jobPosterId: String(job.jobPosterUserId),
        routerId: job.routerUserId ? String(job.routerUserId) : null,
        createdAt: now,
        dedupeKeyBase: `contractor_accepted:${inviteId}`,
      },
    };
    await tx.insert(v4EventOutbox).values({
      id: randomUUID(),
      eventType: acceptEvent.type,
      payload: JSON.parse(JSON.stringify(acceptEvent.payload)) as Record<string, unknown>,
      createdAt: now,
    });
    console.log("[event-outbox] event queued", { type: acceptEvent.type, jobId: inviteAfterLock.jobId });

    console.log("[invite-accept] transaction completing successfully", { jobId: inviteAfterLock.jobId });
    return { success: true as const, jobId: inviteAfterLock.jobId };
  });
  } catch (txErr) {
    if (isV4Error(txErr)) throw txErr;
    const cause = (txErr as any)?.cause;
    console.error("[invite-accept-tx-error]", {
      inviteId,
      contractorUserId,
      message: txErr instanceof Error ? txErr.message : String(txErr),
      code: (txErr as any)?.code,
      causeMessage: cause instanceof Error ? cause.message : typeof cause === "object" && cause ? JSON.stringify(cause) : String(cause ?? ""),
      causeCode: cause?.code,
      severity: cause?.severity,
      detail: cause?.detail,
      constraint: cause?.constraint,
      column: cause?.column,
      table: cause?.table,
      stack: txErr instanceof Error ? txErr.stack?.slice(0, 500) : undefined,
    });
    throw txErr;
  }
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
        const rejectEvent = {
          type: "CONTRACTOR_REJECTED_INVITE" as const,
          payload: {
            inviteId,
            jobId: invite.jobId,
            routerId: job.routerUserId ? String(job.routerUserId) : null,
            jobPosterId: job.jobPosterUserId ? String(job.jobPosterUserId) : null,
            createdAt: now,
            dedupeKeyBase: `invite_rejected:${inviteId}`,
          },
        };
        await tx.insert(v4EventOutbox).values({
          id: randomUUID(),
          eventType: rejectEvent.type,
          payload: JSON.parse(JSON.stringify(rejectEvent.payload)) as Record<string, unknown>,
          createdAt: now,
        });
        console.log("[event-outbox] event queued", { type: rejectEvent.type, jobId: invite.jobId });
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
