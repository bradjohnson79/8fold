import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4Messages } from "@/db/schema/v4Message";
import { getJobPosterPaymentStatus } from "./jobPosterPaymentService";
import { promoteDuePublishedJobsForJobPoster } from "./jobExecutionService";

export type JobPosterSummary = {
  jobsPosted: number;
  fundsSecured: number;
  paymentStatus: "CONNECTED" | "NOT_CONNECTED";
  unreadMessages: number;
  activeAssignments: number;
};

export async function getJobPosterSummary(userId: string): Promise<JobPosterSummary> {
  await promoteDuePublishedJobsForJobPoster(userId);
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

  const fundsSecured = Number(fundsRows[0]?.total ?? 0);

  const unreadRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(v4Messages)
    .where(and(eq(v4Messages.toUserId, userId), isNull(v4Messages.readAt)));

  const unreadMessages = Number(unreadRows[0]?.count ?? 0);

  const activeAssignmentRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(
      and(
        eq(jobs.job_poster_user_id, userId),
        sql`${jobs.contractor_user_id} is not null`,
        sql`${jobs.status} in ('ASSIGNED', 'PUBLISHED', 'JOB_STARTED', 'IN_PROGRESS', 'CONTRACTOR_COMPLETED', 'COMPLETED')`,
      ),
    );
  const activeAssignments = Number(activeAssignmentRows[0]?.count ?? 0);

  const paymentStatus = await getJobPosterPaymentStatus(userId);

  return {
    jobsPosted,
    fundsSecured,
    paymentStatus: paymentStatus.connected ? "CONNECTED" : "NOT_CONNECTED",
    unreadMessages,
    activeAssignments,
  };
}
