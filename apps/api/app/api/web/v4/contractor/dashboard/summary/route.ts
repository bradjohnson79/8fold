import { NextResponse } from "next/server";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";
import { countPendingInvites } from "@/src/services/v4/contractorInviteService";
import { listJobs } from "@/src/services/v4/contractorJobService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(req: Request) {
  let requestId: string | undefined;
  try {
    const ctx = await requireContractorV4(req);
    if (ctx instanceof Response) return ctx;
    requestId = ctx.requestId;

    const userId = ctx.internalUser.id;

    const [pendingInvites, assignedJobs, awaitingPosterCompletion, fullyCompletedJobs] = await Promise.all([
      countPendingInvites(userId).catch(() => 0),
      listJobs(userId, "assigned").catch(() => []),
      db
        .select({
          id: jobs.id,
          title: jobs.title,
          completionWindowExpiresAt: jobs.completion_window_expires_at,
        })
        .from(jobs)
        .where(
          and(
            eq(jobs.contractor_user_id, userId),
            isNotNull(jobs.contractor_marked_complete_at),
            isNull(jobs.poster_marked_complete_at),
            isNull(jobs.completed_at),
          ),
        )
        .catch((e) => { console.error("[contractor-summary] awaitingPosterCompletion query failed:", e); return []; }),
      db
        .select({
          id: jobs.id,
          title: jobs.title,
          completedAt: jobs.completed_at,
          payoutStatus: jobs.payout_status,
          contractorPayoutCents: jobs.contractor_payout_cents,
        })
        .from(jobs)
        .where(
          and(
            eq(jobs.contractor_user_id, userId),
            isNotNull(jobs.completed_at),
            sql`${jobs.status} = 'COMPLETED'`,
          ),
        )
        .catch((e) => { console.error("[contractor-summary] fullyCompletedJobs query failed:", e); return []; }),
    ]);

    const fullyCompleted = fullyCompletedJobs ?? [];
    return NextResponse.json({
      pendingInvites,
      assignedJobsCount: Array.isArray(assignedJobs) ? assignedJobs.length : 0,
      completedJobsCount: fullyCompleted.length,
      awaitingPosterCompletion: (awaitingPosterCompletion ?? []).map((j) => ({
        jobId: j.id,
        title: j.title,
        completionWindowExpiresAt: j.completionWindowExpiresAt?.toISOString() ?? null,
      })),
      fullyCompletedJobs: fullyCompleted.map((j) => ({
        jobId: j.id,
        title: j.title,
        completedAt: j.completedAt?.toISOString() ?? null,
        payoutStatus: j.payoutStatus,
        contractorPayoutCents: j.contractorPayoutCents,
      })),
    });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_CONTRACTOR_SUMMARY_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
