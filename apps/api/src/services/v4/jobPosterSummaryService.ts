import { and, eq, inArray, isNull, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4Messages } from "@/db/schema/v4Message";
import { v4Reviews } from "@/db/schema/v4Review";
import { logEvent } from "@/src/server/observability/log";
import { getJobPosterPaymentStatus } from "./jobPosterPaymentService";

export type AwaitingPosterReport = {
  jobId: string;
  title: string | null;
  completionWindowExpiresAt: string | null;
  contractorName: string | null;
};

export type FullyCompletedJob = {
  jobId: string;
  title: string | null;
  completedAt: string | null;
  hasReview: boolean;
};

export type JobPosterSummary = {
  jobsPosted: number;
  fundsSecured: number;
  paymentStatus: "CONNECTED" | "NOT_CONNECTED";
  unreadMessages: number;
  activeAssignments: number;
  awaitingPosterReport: AwaitingPosterReport[];
  fullyCompletedJobs: FullyCompletedJob[];
};

/** Read-only summary. No mutations, no promote-due. */
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

  const awaitingPosterRows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      completionWindowExpiresAt: jobs.completion_window_expires_at,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.job_poster_user_id, userId),
        isNotNull(jobs.contractor_marked_complete_at),
        isNull(jobs.poster_marked_complete_at),
        isNull(jobs.completed_at),
      ),
    )
    .catch(() => []);

  const completedRows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      completedAt: jobs.completed_at,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.job_poster_user_id, userId),
        isNotNull(jobs.completed_at),
        sql`${jobs.status} = 'COMPLETED'`,
      ),
    )
    .catch(() => []);

  const completedJobIds = (completedRows ?? []).map((j) => j.id).filter(Boolean);
  let reviewedJobIds = new Set<string>();
  if (completedJobIds.length > 0) {
    const reviewRows = await db
      .select({ jobId: v4Reviews.jobId })
      .from(v4Reviews)
      .where(inArray(v4Reviews.jobId, completedJobIds))
      .catch(() => []);
    reviewedJobIds = new Set((reviewRows ?? []).map((r) => r.jobId));
  }

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
    awaitingPosterReport: (awaitingPosterRows ?? []).map((j) => ({
      jobId: j.id,
      title: j.title,
      completionWindowExpiresAt: j.completionWindowExpiresAt?.toISOString() ?? null,
      contractorName: null,
    })),
    fullyCompletedJobs: (completedRows ?? []).map((j) => ({
      jobId: j.id,
      title: j.title,
      completedAt: j.completedAt?.toISOString() ?? null,
      hasReview: reviewedJobIds.has(j.id),
    })),
  };
}
