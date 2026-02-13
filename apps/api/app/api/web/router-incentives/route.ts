import { NextResponse } from "next/server";
import { optionalUser } from "../../../../src/auth/rbac";
import { toHttpError } from "../../../../src/http/errors";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../../../db/drizzle";
import { jobHolds, jobs } from "../../../../db/schema";

/**
 * Web-only incentives endpoint.
 * Auth is via existing session token (Authorization header).
 *
 * Router incentive:
 * - 50 successful routed jobs (job reaches COMPLETED_APPROVED with no ACTIVE holds)
 * - No automatic promotion; admin approval required (UI only).
 */
export async function GET(req: Request) {
  try {
    const u = await optionalUser(req);
    if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const target = 50;
    const progress = Math.min(successfulEligible, target);
    const eligible = successfulEligible >= target;

    const successRate =
      routedTotal === 0 ? 0 : Math.round((successfulCompletedApproved / routedTotal) * 1000) / 10;

    return NextResponse.json({
      routedTotal,
      successfulCompletedApproved,
      successfulEligible,
      successRatePercent: successRate,
      incentive: {
        target,
        progress,
        eligible,
        status: eligible ? "ELIGIBLE_AWAITING_ADMIN" : progress === 0 ? "LOCKED" : "IN_PROGRESS",
        headline: eligible
          ? "Eligible for Senior Router Moderator Review"
          : "Senior Router Track",
        summary:
          "Route 50 successful jobs to become eligible for Senior Router Moderator review (admin approval required).",
        benefitSummary: "Opportunity to earn $250/month for senior router duties (admin approval required)."
      }
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

