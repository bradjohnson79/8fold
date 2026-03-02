import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4Messages } from "@/db/schema/v4Message";
import { getJobPosterPaymentStatus } from "./jobPosterPaymentService";
import { promoteDuePublishedJobsForJobPoster } from "./jobExecutionService";
import { logEvent } from "@/src/server/observability/log";

export type JobPosterSummary = {
  jobsPosted: number;
  fundsSecured: number;
  paymentStatus: "CONNECTED" | "NOT_CONNECTED";
  unreadMessages: number;
  activeAssignments: number;
};

export async function getJobPosterSummary(userId: string): Promise<JobPosterSummary> {
  try {
    await promoteDuePublishedJobsForJobPoster(userId);
  } catch (error) {
    logEvent({
      level: "error",
      event: "job_poster.dashboard.promote_due_failed",
      userId,
      context: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
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

  let paymentStatus: { connected: boolean } = { connected: false };
  try {
    paymentStatus = await getJobPosterPaymentStatus(userId);
  } catch (error) {
    logEvent({
      level: "error",
      event: "job_poster.dashboard.payment_status_failed",
      userId,
      context: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }

  return {
    jobsPosted,
    fundsSecured,
    paymentStatus: paymentStatus.connected ? "CONNECTED" : "NOT_CONNECTED",
    unreadMessages,
    activeAssignments,
  };
}
