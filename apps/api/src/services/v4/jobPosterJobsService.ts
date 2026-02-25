import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";

export type JobListItem = {
  id: string;
  title: string;
  status: string;
  routingStatus: string;
  amountCents: number;
  createdAt: string;
};

export async function listJobsForJobPoster(userId: string): Promise<JobListItem[]> {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
      routingStatus: jobs.routing_status,
      amountCents: jobs.amount_cents,
      createdAt: jobs.created_at,
    })
    .from(jobs)
    .where(and(eq(jobs.job_poster_user_id, userId), ne(jobs.status, "DRAFT")))
    .orderBy(desc(jobs.created_at));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: String(r.status ?? ""),
    routingStatus: String(r.routingStatus ?? ""),
    amountCents: Number(r.amountCents ?? 0),
    createdAt: r.createdAt?.toISOString?.() ?? "",
  }));
}

export type JobDetail = {
  id: string;
  title: string;
  scope: string;
  status: string;
  routingStatus: string;
  amountCents: number;
  addressFull: string | null;
  tradeCategory: string;
  createdAt: string;
};

export async function getJobDetailForJobPoster(jobId: string, userId: string): Promise<JobDetail | null> {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      scope: jobs.scope,
      status: jobs.status,
      routingStatus: jobs.routing_status,
      amountCents: jobs.amount_cents,
      address_full: jobs.address_full,
      trade_category: jobs.trade_category,
      createdAt: jobs.created_at,
      jobPosterUserId: jobs.job_poster_user_id,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const r = rows[0];
  if (!r || r.jobPosterUserId !== userId) return null;

  return {
    id: r.id,
    title: r.title,
    scope: r.scope,
    status: String(r.status ?? ""),
    routingStatus: String(r.routingStatus ?? ""),
    amountCents: Number(r.amountCents ?? 0),
    addressFull: r.address_full ?? null,
    tradeCategory: String(r.trade_category ?? ""),
    createdAt: r.createdAt?.toISOString?.() ?? "",
  };
}
