import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4Messages } from "@/db/schema/v4Message";
import { v4PmRequests } from "@/db/schema/v4PmRequest";
import { getJobPosterPaymentStatus } from "./jobPosterPaymentService";

export type JobPosterSummary = {
  jobsPosted: number;
  fundsSecuredCents: number;
  fundsSecuredLabel: string;
  jobAmountPaidCents: number | null;
  jobAmountPaidLabel: string;
  activePmRequests: number;
  unreadMessages: number;
  paymentConnected: boolean;
};

export async function getJobPosterSummary(userId: string): Promise<JobPosterSummary> {
  const jobsPostedRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(
      and(
        eq(jobs.job_poster_user_id, userId),
        ne(jobs.status, "DRAFT")
      )
    );

  const jobsPosted = Number(jobsPostedRows[0]?.count ?? 0);

  const fundsRows = await db
    .select({
      total: sql<number>`coalesce(sum(${jobs.amount_cents}), 0)::int`,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.job_poster_user_id, userId),
        ne(jobs.status, "DRAFT"),
        sql`${jobs.funds_secured_at} is not null`
      )
    );

  const fundsSecuredCents = Number(fundsRows[0]?.total ?? 0);
  const fundsSecuredLabel =
    fundsSecuredCents > 0 ? `$${(fundsSecuredCents / 100).toFixed(2)}` : "—";

  const jobAmountPaidCents: number | null = null;
  const jobAmountPaidLabel = "Coming Soon";

  const pmRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(v4PmRequests)
    .where(and(eq(v4PmRequests.jobPosterUserId, userId), eq(v4PmRequests.status, "PENDING")));

  const activePmRequests = Number(pmRows[0]?.count ?? 0);

  const unreadRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(v4Messages)
    .where(and(eq(v4Messages.toUserId, userId), isNull(v4Messages.readAt)));

  const unreadMessages = Number(unreadRows[0]?.count ?? 0);

  const paymentStatus = await getJobPosterPaymentStatus(userId);

  return {
    jobsPosted,
    fundsSecuredCents,
    fundsSecuredLabel,
    jobAmountPaidCents,
    jobAmountPaidLabel,
    activePmRequests,
    unreadMessages,
    paymentConnected: paymentStatus.connected,
  };
}
