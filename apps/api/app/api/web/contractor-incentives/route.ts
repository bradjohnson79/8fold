import { NextResponse } from "next/server";
import { optionalUser } from "../../../../src/auth/rbac";
import { toHttpError } from "../../../../src/http/errors";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { auditLogs, contractors, jobAssignments, jobHolds, jobs, users } from "../../../../db/schema";

/**
 * Web-only incentives endpoint.
 * Contractors are linked by matching authenticated user email to Contractor.email (v1-friendly).
 *
 * Contractor incentive:
 * - 10 successful jobs (job reaches COMPLETED_APPROVED with no ACTIVE holds)
 * - Bonus is NOT automatic; admin approval required (UI only).
 */
export async function GET(req: Request) {
  try {
    const u = await optionalUser(req);
    if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user =
      (
        await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(eq(users.id, u.userId))
          .limit(1)
      )[0] ?? null;
    if (!user?.email) return NextResponse.json({ error: "Missing user email" }, { status: 400 });

    const contractor =
      (
        await db
          .select({ id: contractors.id, businessName: contractors.businessName })
          .from(contractors)
          .where(eq(contractors.email, user.email))
          .limit(1)
      )[0] ?? null;
    if (!contractor) {
      return NextResponse.json({ hasContractor: false, waiverAccepted: false, incentive: null });
    }

    const waiverAccepted =
      (
        await db
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(
            or(
              and(
                eq(auditLogs.action, "CONTRACTOR_WAIVER_ACCEPTED"),
                eq(auditLogs.entityType, "User"),
                eq(auditLogs.entityId, user.id),
                eq(auditLogs.actorUserId, user.id),
              ),
              and(
                eq(auditLogs.action, "CONTRACTOR_WAIVER_ACCEPTED"),
                eq(auditLogs.entityType, "Contractor"),
                eq(auditLogs.entityId, contractor.id),
                eq(auditLogs.actorUserId, user.id),
              ),
            ),
          )
          .limit(1)
      )[0]?.id != null;

    const completedApproved =
      (
        await db
          .select({ c: sql<number>`count(${jobAssignments.id})` })
          .from(jobAssignments)
          .innerJoin(jobs, eq(jobs.id, jobAssignments.jobId))
          .where(and(eq(jobAssignments.contractorId, contractor.id), eq(jobs.status, "COMPLETED_APPROVED" as any)))
      )[0]?.c ?? 0;

    // Exclude any jobs with unresolved holds/disputes.
    const eligible =
      (
        await db
          .select({ c: sql<number>`count(${jobAssignments.id})` })
          .from(jobAssignments)
          .innerJoin(jobs, eq(jobs.id, jobAssignments.jobId))
          .leftJoin(jobHolds, and(eq(jobHolds.jobId, jobs.id), eq(jobHolds.status, "ACTIVE" as any)))
          .where(
            and(
              eq(jobAssignments.contractorId, contractor.id),
              eq(jobs.status, "COMPLETED_APPROVED" as any),
              isNull(jobHolds.id),
            ),
          )
      )[0]?.c ?? 0;

    const target = 10;
    const progress = Math.min(eligible, target);
    const unlocked = eligible >= target;

    return NextResponse.json({
      hasContractor: true,
      contractor: { id: contractor.id, businessName: contractor.businessName },
      waiverAccepted,
      completedApproved,
      eligibleCompletedApproved: eligible,
      incentive: {
        target,
        progress,
        unlocked,
        status: unlocked ? "COMPLETED_AWAITING_ADMIN" : progress === 0 ? "LOCKED" : "IN_PROGRESS",
        headline: "Complete 10 successful jobs → Earn $500 bonus",
        summary:
          "Only jobs marked COMPLETED_APPROVED count. Jobs with unresolved holds/disputes do not count. Admin approval required."
      }
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

