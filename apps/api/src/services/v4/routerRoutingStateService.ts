import { and, desc, eq, sql } from "drizzle-orm";
import { jobs } from "@/db/schema/job";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";

export async function reconcileV4RoutingStateTx(tx: any): Promise<void> {
  await tx
    .update(jobs)
    .set({
      claimed_by_user_id: null,
      claimed_at: null,
      routing_status: "UNROUTED",
    } as any)
    .where(
      and(
        eq(jobs.archived, false),
        eq(jobs.status, "OPEN_FOR_ROUTING"),
        eq(jobs.routing_status, "ROUTED_BY_ROUTER"),
        sql`${jobs.contractor_user_id} is null`,
        sql`${jobs.claimed_by_user_id} is not null`,
        sql`not exists (
          select 1
          from ${v4ContractorJobInvites} i
          where i.job_id = ${jobs.id}
            and i.status = 'PENDING'
        )`,
      ),
    );
}

export async function getRouterActiveRoutingLockTx(
  tx: any,
  routerUserId: string,
): Promise<{ activeJobId: string | null; blockedReason: string | null }> {
  const rows = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.archived, false),
        eq(jobs.status, "OPEN_FOR_ROUTING"),
        eq(jobs.routing_status, "ROUTED_BY_ROUTER"),
        eq(jobs.claimed_by_user_id, routerUserId),
        sql`${jobs.contractor_user_id} is null`,
      ),
    )
    .orderBy(desc(jobs.routed_at), desc(jobs.created_at))
    .limit(1);

  const activeJobId = rows[0]?.id ?? null;
  if (!activeJobId) return { activeJobId: null, blockedReason: null };

  return {
    activeJobId,
    blockedReason: "Finish your active routed job before routing another one.",
  };
}
