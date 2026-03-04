import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";
import { ROUTING_STATUS } from "@/src/router/routingStatus";

export async function expireStaleInvitesAndResetJobs(): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date();
    const expiredInviteRows = await tx
      .select({
        id: v4ContractorJobInvites.id,
        jobId: v4ContractorJobInvites.jobId,
        contractorUserId: v4ContractorJobInvites.contractorUserId,
      })
      .from(v4ContractorJobInvites)
      .where(and(eq(v4ContractorJobInvites.status, "PENDING"), lt(v4ContractorJobInvites.expiresAt, now)));

    await tx
      .update(v4ContractorJobInvites)
      .set({ status: "EXPIRED", respondedAt: now })
      .where(and(eq(v4ContractorJobInvites.status, "PENDING"), lt(v4ContractorJobInvites.expiresAt, now)));

    if (expiredInviteRows.length > 0) {
      for (const row of expiredInviteRows) {
        await emitDomainEvent(
          {
            type: "CONTRACTOR_INVITE_EXPIRED",
            payload: {
              inviteId: row.id,
              jobId: row.jobId,
              contractorId: row.contractorUserId,
              createdAt: now,
              dedupeKey: `invite_expired:${row.id}`,
            },
          },
          { tx },
        );
      }
    }

    const routedExpiredRows = await tx
      .select({
        id: jobs.id,
        routerUserId: jobs.claimed_by_user_id,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.status, "INVITED" as any),
          lt(jobs.routing_expires_at, now),
          sql`not exists (
            select 1
            from v4_contractor_job_invites i
            where i.job_id = ${jobs.id}
              and i.status = 'ACCEPTED'
          )`,
        ),
      );

    await tx
      .update(jobs)
      .set({
        status: "OPEN_FOR_ROUTING" as any,
        routing_started_at: null,
        routing_expires_at: null,
        claimed_by_user_id: null,
        claimed_at: null,
        routed_at: null,
        routing_status: ROUTING_STATUS.UNROUTED as any,
        updated_at: now,
      })
      .where(and(eq(jobs.status, "INVITED" as any), lt(jobs.routing_expires_at, now)));

    if (routedExpiredRows.length > 0) {
      for (const row of routedExpiredRows) {
        const routerId = String(row.routerUserId ?? "").trim();
        if (!routerId) continue;
        await emitDomainEvent(
          {
            type: "CONTRACTOR_INVITE_EXPIRED",
            payload: {
              inviteId: `routing-window:${row.id}`,
              jobId: row.id,
              contractorId: null,
              routerId,
              createdAt: now,
              dedupeKey: `routing_window_expired:${row.id}`,
            },
          },
          { tx },
        );
      }
    }

    await tx
      .update(jobs)
      .set({
        status: "OPEN_FOR_ROUTING" as any,
        contractor_user_id: null,
        poster_accept_expires_at: null,
        claimed_by_user_id: null,
        claimed_at: null,
        routed_at: null,
        routing_status: ROUTING_STATUS.UNROUTED as any,
        updated_at: now,
      })
      .where(
        and(
          eq(jobs.status, "ASSIGNED"),
          lt(jobs.poster_accept_expires_at, new Date()),
          sql`${jobs.appointment_at} is null`,
          sql`${jobs.appointment_published_at} is null`,
        ),
      );

    // Reset jobs with INVITES_SENT/ROUTED_BY_ROUTER where all invites expired (legacy jobs without routing_expires_at, or safety net)
    const invitesSentStatuses = [ROUTING_STATUS.INVITES_SENT, ROUTING_STATUS.ROUTED_BY_ROUTER] as const;
    const expiredInvitesSentRows = await tx
      .select({ id: jobs.id, routerUserId: jobs.claimed_by_user_id })
      .from(jobs)
      .where(
        and(
          inArray(jobs.routing_status, invitesSentStatuses as any),
          sql`${jobs.contractor_user_id} is null`,
          sql`not exists (
            select 1 from v4_contractor_job_invites i
            where i.job_id = ${jobs.id}
              and i.status = 'PENDING'
              and i.expires_at > ${now}
          )`,
        ),
      );

    await tx
      .update(jobs)
      .set({
        status: "OPEN_FOR_ROUTING" as any,
        routing_started_at: null,
        routing_expires_at: null,
        claimed_by_user_id: null,
        claimed_at: null,
        routed_at: null,
        routing_status: ROUTING_STATUS.UNROUTED as any,
        updated_at: now,
      })
      .where(
        and(
          inArray(jobs.routing_status, invitesSentStatuses as any),
          sql`${jobs.contractor_user_id} is null`,
          sql`not exists (
            select 1 from v4_contractor_job_invites i
            where i.job_id = ${jobs.id}
              and i.status = 'PENDING'
              and i.expires_at > ${now}
          )`,
        ),
      );

    for (const row of expiredInvitesSentRows) {
      const routerId = String(row.routerUserId ?? "").trim();
      if (routerId) {
        await emitDomainEvent(
          {
            type: "CONTRACTOR_INVITE_EXPIRED",
            payload: {
              inviteId: `routing-window:${row.id}`,
              jobId: row.id,
              contractorId: null,
              routerId,
              createdAt: now,
              dedupeKey: `routing_window_expired:${row.id}`,
            },
          },
          { tx },
        );
      }
    }
  });
}
