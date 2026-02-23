import { NextResponse } from "next/server";
import { requireSupportRequester } from "../../../../../src/auth/rbac";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { jobs } from "../../../../../db/schema/job";

function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data }, { status: 200 });
}
function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isSupportRequesterRole(role: string): boolean {
  return role === "JOB_POSTER" || role === "ROUTER" || role === "CONTRACTOR";
}

export async function GET(req: Request) {
  try {
    const user = await requireSupportRequester(req);
    const role = String(user.role);
    if (!isSupportRequesterRole(role)) {
      return fail(403, "Forbidden");
    }

    const whereClause =
      role === "ROUTER"
        ? eq(jobs.claimed_by_user_id, user.userId)
        : role === "CONTRACTOR"
          ? eq(jobs.contractor_user_id, user.userId)
          : eq(jobs.job_poster_user_id, user.userId);

    const rows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        region: jobs.region,
        publishedAt: jobs.published_at,
      })
      .from(jobs)
      .where(and(eq(jobs.is_mock, false), whereClause))
      .orderBy(desc(jobs.published_at), desc(jobs.id))
      .limit(200);

    return ok({
      jobs: rows.map((j) => ({
        ...j,
        publishedAt: (j.publishedAt as any).toISOString()
      })),
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    const message = err instanceof Error ? err.message : "Failed";
    return fail(status, message);
  }
}

