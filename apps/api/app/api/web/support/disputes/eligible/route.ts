import { NextResponse } from "next/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { requireSupportRequester } from "../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../src/http/errors";
import { db } from "../../../../../../db/drizzle";
import { jobs } from "../../../../../../db/schema/job";

function isSupportRequesterRole(role: string): boolean {
  return role === "JOB_POSTER" || role === "ROUTER" || role === "CONTRACTOR";
}

export async function GET(req: Request) {
  try {
    const user = await requireSupportRequester(req);
    const role = String(user.role);
    if (!isSupportRequesterRole(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // v1: disputes are user-facing for Job Posters and Contractors only.
    if (role === "ROUTER") return NextResponse.json({ eligible: false });

    const whereClause =
      role === "CONTRACTOR" ? eq(jobs.contractorUserId, user.userId) : eq(jobs.jobPosterUserId, user.userId);

    const rows = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.isMock, false),
          eq(jobs.archived, false),
          whereClause,
          eq(jobs.paymentStatus, "FUNDED" as any),
          ne(jobs.payoutStatus, "RELEASED" as any),
          isNull(jobs.routerApprovedAt),
          ne(jobs.status, "DISPUTED" as any),
        ),
      )
      .limit(1);

    return NextResponse.json({ eligible: rows.length > 0 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

