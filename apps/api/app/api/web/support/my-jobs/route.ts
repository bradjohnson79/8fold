import { requireSupportRequester } from "../../../../../src/auth/rbac";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { fail, ok } from "../../../../../src/lib/api/respond";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { jobs } from "../../../../../db/schema/job";

function isSupportRequesterRole(role: string): boolean {
  return role === "JOB_POSTER" || role === "ROUTER" || role === "CONTRACTOR";
}

export async function GET(req: Request) {
  try {
    const user = await requireSupportRequester(req);
    const role = String(user.role);
    if (!isSupportRequesterRole(role)) {
      return fail(403, "forbidden");
    }

    const whereClause =
      role === "ROUTER"
        ? eq(jobs.claimedByUserId, user.userId)
        : role === "CONTRACTOR"
          ? eq(jobs.contractorUserId, user.userId)
          : eq(jobs.jobPosterUserId, user.userId);

    const rows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        region: jobs.region,
        publishedAt: jobs.publishedAt,
      })
      .from(jobs)
      .where(and(eq(jobs.isMock, false), whereClause))
      .orderBy(desc(jobs.publishedAt), desc(jobs.id))
      .limit(200);

    return ok({
      jobs: rows.map((j) => ({
        ...j,
        publishedAt: (j.publishedAt as any).toISOString()
      }))
    });
  } catch (err) {
    return handleApiError(err, "GET /api/web/support/my-jobs");
  }
}

