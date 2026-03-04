import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { users } from "@/db/schema/user";

export async function getV4RouterRoutedJobs(userId: string) {
  const raw = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      title: jobs.title,
      scope: jobs.scope,
      region: jobs.region,
      routingStatus: jobs.routing_status,
      claimedAt: jobs.claimed_at,
      routedAt: jobs.routed_at,
      tradeCategory: jobs.trade_category,
      routerEarningsCents: jobs.router_earnings_cents,
      estimatedCompletionDate: jobs.estimated_completion_date,
      contractorUserId: jobs.contractor_user_id,
    })
    .from(jobs)
    .where(eq(jobs.claimed_by_user_id, userId))
    .orderBy(desc(jobs.claimed_at), desc(jobs.id))
    .limit(100);

  const contractorIds = [...new Set(raw.map((j) => j.contractorUserId).filter(Boolean))] as string[];
  const contractorRows =
    contractorIds.length > 0
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, contractorIds))
      : [];
  const contractorMap = new Map(contractorRows.map((r) => [r.id, { id: r.id, name: String(r.name ?? "").trim() || "Contractor" }]));

  return {
    jobs: raw.map((j) => ({
      id: j.id,
      status: j.status,
      title: j.title,
      scope: j.scope,
      region: j.region,
      routingStatus: j.routingStatus,
      claimedAt: j.claimedAt ? j.claimedAt.toISOString() : null,
      routedAt: j.routedAt ? j.routedAt.toISOString() : null,
      tradeCategory: j.tradeCategory ?? "",
      routerEarningsCents: Number(j.routerEarningsCents ?? 0),
      estimatedCompletionDate: j.estimatedCompletionDate ? j.estimatedCompletionDate.toISOString().slice(0, 10) : null,
      contractor: j.contractorUserId ? contractorMap.get(j.contractorUserId) ?? null : null,
    })),
  };
}
