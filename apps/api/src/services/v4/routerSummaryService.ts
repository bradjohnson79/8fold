import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";

export async function getV4RouterSummary(userId: string) {
  const rows = await db
    .select({
      totalRouted: sql<number>`count(*)::int`,
      activeRouted: sql<number>`count(*) filter (where ${jobs.status} in ('OPEN_FOR_ROUTING', 'ASSIGNED', 'IN_PROGRESS'))::int`,
      completedRouted: sql<number>`count(*) filter (where ${jobs.status} in ('CONTRACTOR_COMPLETED', 'CUSTOMER_APPROVED', 'CUSTOMER_REJECTED'))::int`,
      pendingApprovals: sql<number>`count(*) filter (where ${jobs.status} = 'CUSTOMER_APPROVED' and ${jobs.router_approved_at} is null)::int`,
      commissionEarnedCents: sql<number>`coalesce(sum(${jobs.router_earnings_cents}) filter (where ${jobs.released_at} is not null), 0)::int`,
    })
    .from(jobs)
    .where(eq(jobs.claimed_by_user_id, userId));

  const r = rows[0] ?? null;
  return {
    totalRouted: r ? Number((r as any).totalRouted ?? 0) : 0,
    activeRouted: r ? Number((r as any).activeRouted ?? 0) : 0,
    completedRouted: r ? Number((r as any).completedRouted ?? 0) : 0,
    pendingApprovals: r ? Number((r as any).pendingApprovals ?? 0) : 0,
    commissionEarnedCents: r ? Number((r as any).commissionEarnedCents ?? 0) : 0,
  };
}
