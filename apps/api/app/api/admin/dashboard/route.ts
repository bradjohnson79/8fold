import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, eq, or, sql, lt } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractors } from "@/db/schema/contractor";
import { jobs } from "@/db/schema/job";
import { jobAssignments } from "@/db/schema/jobAssignment";
import { payoutRequests } from "@/db/schema/payoutRequest";
import { payouts } from "@/db/schema/payout";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    async function count(q: Promise<unknown[]>): Promise<number> {
      const res = await q;
      return Number((res as any)?.[0]?.c ?? 0);
    }

    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cutoff72h = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const archivedExcluded = eq(jobs.archived, false);

    const [
      jobsAvailable,
      jobsAwaitingAssignment,
      jobsAssigned,
      jobsCompleted,
      contractorsPendingApproval,
      contractorsActive,
      contractorsSuspended,
      payoutRequestsRequested,
      stalledJobsOver24h,
      stalledAssignmentsOver72h,
      failedPayouts,
    ] = await Promise.all([
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(jobs)
          .where(and(archivedExcluded, eq(jobs.isMock, false), eq(jobs.status, "PUBLISHED")))
      ),
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(jobs)
          .where(
            and(
              archivedExcluded,
              eq(jobs.isMock, false),
              eq(jobs.status, "PUBLISHED"),
              or(eq(jobs.routingStatus, "ROUTED_BY_ROUTER"), eq(jobs.routingStatus, "ROUTED_BY_ADMIN"))
            )
          )
      ),
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(jobs)
          .where(and(archivedExcluded, eq(jobs.isMock, false), eq(jobs.status, "ASSIGNED")))
      ),
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(jobs)
          .where(and(archivedExcluded, eq(jobs.isMock, false), eq(jobs.status, "COMPLETED_APPROVED")))
      ),
      // DB authoritative ContractorStatus values: PENDING | APPROVED | REJECTED
      count(db.select({ c: sql<number>`count(*)` }).from(contractors).where(eq(contractors.status, "PENDING"))),
      count(db.select({ c: sql<number>`count(*)` }).from(contractors).where(eq(contractors.status, "APPROVED"))),
      // No SUSPENDED status in DB authoritative ContractorStatus; treat REJECTED as the "inactive" bucket.
      count(db.select({ c: sql<number>`count(*)` }).from(contractors).where(eq(contractors.status, "REJECTED"))),
      count(db.select({ c: sql<number>`count(*)` }).from(payoutRequests).where(eq(payoutRequests.status, "REQUESTED"))),
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(jobs)
          .where(
            and(
              archivedExcluded,
              eq(jobs.isMock, false),
              or(eq(jobs.routingStatus, "ROUTED_BY_ROUTER"), eq(jobs.routingStatus, "ROUTED_BY_ADMIN")),
              lt(sql`coalesce(${jobs.routedAt}, ${jobs.publishedAt})`, cutoff24h)
            )
          )
      ),
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(jobAssignments)
          .where(lt(jobAssignments.createdAt, cutoff72h))
      ),
      count(db.select({ c: sql<number>`count(*)` }).from(payouts).where(eq(payouts.status, "FAILED"))),
    ]).catch(() => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    return NextResponse.json({
      ok: true,
      data: {
        jobs: {
          available: jobsAvailable,
          awaitingAssignment: jobsAwaitingAssignment,
          assigned: jobsAssigned,
          completed: jobsCompleted,
        },
        contractors: {
          pendingApproval: contractorsPendingApproval,
          active: contractorsActive,
          suspended: contractorsSuspended,
        },
        money: {
          pendingPayouts: payoutRequestsRequested,
          feesCollected: { todayCents: 0, weekCents: 0 },
          ledgerWarnings: { negativeAvailableCount: 0 },
        },
        alerts: {
          stalledJobsRoutedOver24h: stalledJobsOver24h,
          stalledAssignmentsOver72h: stalledAssignmentsOver72h,
          failedPayouts: failedPayouts,
        },
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/dashboard", {
      route: "/api/admin/dashboard",
      userId: auth.userId,
    });
  }
}
