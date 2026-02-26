import { desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";

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
    })
    .from(jobs)
    .where(eq(jobs.claimed_by_user_id, userId))
    .orderBy(desc(jobs.claimed_at), desc(jobs.id))
    .limit(100);

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
    })),
  };
}
