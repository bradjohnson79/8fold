import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { jobs } from "@/db/schema/job";
import { users } from "@/db/schema/user";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";

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

  const jobIds = raw.map((j) => j.id);
  const inviteRows =
    jobIds.length > 0
      ? await db
          .select({
            jobId: v4ContractorJobInvites.jobId,
            contractorId: v4ContractorJobInvites.contractorUserId,
            contactName: contractorProfilesV4.contactName,
            businessName: contractorProfilesV4.businessName,
            city: contractorProfilesV4.city,
          })
          .from(v4ContractorJobInvites)
          .innerJoin(contractorProfilesV4, eq(contractorProfilesV4.userId, v4ContractorJobInvites.contractorUserId))
          .where(inArray(v4ContractorJobInvites.jobId, jobIds))
          .orderBy(v4ContractorJobInvites.createdAt)
      : [];

  const inviteMap = new Map<string, { contractorId: string; contactName: string; businessName: string; city: string | null }[]>();
  for (const row of inviteRows) {
    if (!inviteMap.has(row.jobId)) inviteMap.set(row.jobId, []);
    inviteMap.get(row.jobId)!.push({
      contractorId: row.contractorId,
      contactName: row.contactName,
      businessName: row.businessName,
      city: row.city,
    });
  }

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
      invitedContractors: inviteMap.get(j.id) ?? [],
    })),
  };
}
