import { NextResponse } from "next/server";
import { requireRouter } from "../../../../src/auth/rbac";
import { toHttpError } from "../../../../src/http/errors";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobHolds, jobs } from "../../../../db/schema";

/**
 * Web-only incentives endpoint.
 * Auth is via existing session token (Authorization header).
 *
 * Router incentive:
 * - 100 successful routed jobs (job reaches COMPLETED_APPROVED)
 * - Instant access model: eligibility is automatic once you hit the target.
 */
export async function GET(req: Request) {
  try {
    const u = await requireRouter(req);

    const routedTotal =
      (
        await db
          .select({ c: sql<number>`count(${jobs.id})` })
          .from(jobs)
          .where(eq(jobs.claimedByUserId, u.userId))
      )[0]?.c ?? 0;

    const successfulCompletedApproved =
      (
        await db
          .select({ c: sql<number>`count(${jobs.id})` })
          .from(jobs)
          .where(and(eq(jobs.claimedByUserId, u.userId), eq(jobs.status, "COMPLETED_APPROVED" as any)))
      )[0]?.c ?? 0;

    // Exclude any jobs with unresolved holds/disputes (no ACTIVE holds).
    const successfulEligible =
      (
        await db
          .select({ c: sql<number>`count(${jobs.id})` })
          .from(jobs)
          .leftJoin(jobHolds, and(eq(jobHolds.jobId, jobs.id), eq(jobHolds.status, "ACTIVE" as any)))
          .where(
            and(
              eq(jobs.claimedByUserId, u.userId),
              eq(jobs.status, "COMPLETED_APPROVED" as any),
              isNull(jobHolds.id),
            ),
          )
      )[0]?.c ?? 0;

    const target = 100;
    const progress = Math.min(successfulEligible, target);
    const eligible = successfulEligible >= target;

    const successRate =
      routedTotal === 0 ? 0 : Math.round((successfulCompletedApproved / routedTotal) * 1000) / 10;

    return NextResponse.json({
      ok: true,
      routedTotal,
      successfulCompletedApproved,
      successfulEligible,
      successRatePercent: successRate,
      incentive: {
        target,
        progress,
        eligible,
        status: eligible ? "ELIGIBLE" : progress === 0 ? "LOCKED" : "IN_PROGRESS",
        headline: "Senior Router Incentive",
        summary:
          "Route 100 jobs to successful completion to become eligible for Senior Router privileges.",
        benefitSummary: "Senior Routers have increased routing privileges.",
      }
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

