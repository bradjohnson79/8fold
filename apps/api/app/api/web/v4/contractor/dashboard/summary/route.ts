import { NextResponse } from "next/server";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
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

    const [pendingInvites, assignedJobs, completedJobs, awaitingPosterCompletion] = await Promise.all([
      countPendingInvites(userId).catch(() => 0),
      listJobs(userId, "assigned").catch(() => []),
      listJobs(userId, "completed").catch(() => []),
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
        .catch(() => []),
    ]);

    return NextResponse.json({
      pendingInvites,
      assignedJobsCount: Array.isArray(assignedJobs) ? assignedJobs.length : 0,
      completedJobsCount: Array.isArray(completedJobs) ? completedJobs.length : 0,
      availableEarnings: 0,
      awaitingPosterCompletion: (awaitingPosterCompletion ?? []).map((j) => ({
        jobId: j.id,
        title: j.title,
        completionWindowExpiresAt: j.completionWindowExpiresAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_CONTRACTOR_SUMMARY_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
