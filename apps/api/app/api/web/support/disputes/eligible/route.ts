import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { requireSupportRequester } from "../../../../../../src/auth/rbac";
import { db } from "../../../../../../db/drizzle";
import { jobs } from "../../../../../../db/schema/job";

function isSupportRequesterRole(role: string): boolean {
  return role === "JOB_POSTER" || role === "ROUTER" || role === "CONTRACTOR";
}

function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data }, { status: 200 });
}
function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const user = await requireSupportRequester(req);
    const role = String(user.role);
    if (!isSupportRequesterRole(role)) {
      return fail(403, "Forbidden");
    }

    // v1: disputes are user-facing for Job Posters and Contractors only.
    if (role === "ROUTER") return ok({ eligible: false });

    const whereClause =
      role === "CONTRACTOR" ? eq(jobs.contractor_user_id, user.userId) : eq(jobs.job_poster_user_id, user.userId);

    const rows = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.is_mock, false),
          eq(jobs.archived, false),
          whereClause,
          inArray(jobs.payment_status, ["FUNDED", "FUNDS_SECURED"] as any),
          ne(jobs.payout_status, "RELEASED" as any),
          isNull(jobs.router_approved_at),
          ne(jobs.status, "DISPUTED" as any),
        ),
      )
      .limit(1);

    return ok({ eligible: rows.length > 0 });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    const message = err instanceof Error ? err.message : "Failed";
    return fail(status, message);
  }
}

