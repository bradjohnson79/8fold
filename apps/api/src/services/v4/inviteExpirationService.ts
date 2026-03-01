import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";
import { sendBulkNotifications } from "@/src/services/v4/notifications/notificationService";

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
      await sendBulkNotifications(
        expiredInviteRows.map((row) => ({
          userId: row.contractorUserId,
          role: "CONTRACTOR",
          type: "INVITE_EXPIRED",
          title: "Invite expired",
          message: "A routed job invite expired before response.",
          entityType: "INVITE",
          entityId: row.id,
          priority: "NORMAL",
          createdAt: now,
          idempotencyKey: `invite_expired:${row.id}`,
          metadata: { jobId: row.jobId, inviteId: row.id },
        })),
        tx,
      );
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
        routing_status: "UNROUTED" as any,
        updated_at: now,
      })
      .where(and(eq(jobs.status, "INVITED" as any), lt(jobs.routing_expires_at, now)));

    if (routedExpiredRows.length > 0) {
      await sendBulkNotifications(
        routedExpiredRows
          .filter((row) => String(row.routerUserId ?? "").trim().length > 0)
          .map((row) => ({
            userId: String(row.routerUserId),
            role: "ROUTER",
            type: "ROUTING_WINDOW_EXPIRED",
            title: "Routing window expired",
            message: "A routed job returned to the queue because no contractor accepted in time.",
            entityType: "JOB",
            entityId: row.id,
            priority: "NORMAL",
            createdAt: now,
            idempotencyKey: `routing_window_expired:${row.id}`,
          })),
        tx,
      );
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
        routing_status: "UNROUTED" as any,
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
  });
}
