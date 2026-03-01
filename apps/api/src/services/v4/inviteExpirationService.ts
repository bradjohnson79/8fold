import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";

export async function expireStaleInvitesAndResetJobs(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(v4ContractorJobInvites)
      .set({ status: "EXPIRED", respondedAt: new Date() })
      .where(and(eq(v4ContractorJobInvites.status, "PENDING"), lt(v4ContractorJobInvites.expiresAt, new Date())));

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
        updated_at: new Date(),
      })
      .where(
        and(
          eq(jobs.status, "INVITED" as any),
          lt(jobs.routing_expires_at, new Date()),
          sql`not exists (
            select 1
            from v4_contractor_job_invites i
            where i.job_id = ${jobs.id}
              and i.status = 'ACCEPTED'
          )`,
        ),
      );
  });
}
