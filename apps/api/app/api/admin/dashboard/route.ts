import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, asc, eq, isNull, or, sql, lt } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractors } from "@/db/schema/contractor";
import { jobs } from "@/db/schema/job";
import { jobFlags } from "@/db/schema/jobFlag";
import { jobAssignments } from "@/db/schema/jobAssignment";
import { payoutRequests } from "@/db/schema/payoutRequest";
import { payouts } from "@/db/schema/payout";
import { payoutMethods } from "@/db/schema/payoutMethod";

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
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const archivedExcluded = eq(jobs.archived, false);

    // Admin overview: include mock jobs + DB-truth lifecycle filters.
    // "CUSTOMER_APPROVED_AWAITING_ROUTER" is UI-level and maps to:
    // Job.status=CUSTOMER_APPROVED AND routerApprovedAt IS NULL.
    const activeStatusesWhere = or(
      eq(jobs.status, "ASSIGNED" as any),
      and(eq(jobs.status, "CUSTOMER_APPROVED" as any), isNull(jobs.routerApprovedAt)),
    );

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
      jobsOpenForRoutingOver48h,
      routerOnboardingFailures,
      routingUrgencyRows,
      flaggedJobsRows,
    ] = await Promise.all([
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(jobs)
          .where(and(archivedExcluded, activeStatusesWhere))
      ),
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(jobs)
          .where(
            and(
              archivedExcluded,
              eq(jobs.status, "CUSTOMER_APPROVED" as any),
              isNull(jobs.routerApprovedAt),
            )
          )
      ),
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(jobs)
          .where(and(archivedExcluded, eq(jobs.status, "ASSIGNED" as any)))
      ),
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(jobs)
          .where(and(archivedExcluded, eq(jobs.status, "COMPLETED_APPROVED" as any)))
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
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(jobs)
          .where(and(archivedExcluded, eq(jobs.status, "OPEN_FOR_ROUTING" as any), lt(jobs.publishedAt, cutoff48h))),
      ),
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(payoutMethods)
          .where(
            and(
              eq(payoutMethods.provider, "STRIPE" as any),
              eq(payoutMethods.isActive, true),
              sql`coalesce((${payoutMethods.details} ->> 'stripePayoutsEnabled')::boolean, false) = false`,
            ),
          ),
      ),
      db
        .select({
          id: jobs.id,
          title: jobs.title,
          country: jobs.country,
          regionCode: jobs.regionCode,
          city: jobs.city,
          createdAt: jobs.createdAt,
        })
        .from(jobs)
        .where(
          and(
            archivedExcluded,
            eq(jobs.status, "CUSTOMER_APPROVED" as any),
            isNull(jobs.routerApprovedAt),
            lt(jobs.createdAt, cutoff24h),
          ),
        )
        .orderBy(asc(jobs.createdAt), asc(jobs.id))
        .limit(200),
      db
        .select({
          id: jobs.id,
          title: jobs.title,
          city: jobs.city,
          regionCode: jobs.regionCode,
          flagCount: sql<number>`count(${jobFlags.id})`,
        })
        .from(jobs)
        .innerJoin(jobFlags, eq(jobFlags.jobId, jobs.id))
        .where(and(archivedExcluded, eq(jobFlags.resolved, false)))
        .groupBy(jobs.id)
        .orderBy(sql`count(${jobFlags.id}) desc`)
        .limit(200),
    ]).catch(() => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, [], []]);

    const routingUrgencyJobs = (routingUrgencyRows as any[] | undefined) ?? [];
    const flaggedJobs = (flaggedJobsRows as any[] | undefined) ?? [];

    return NextResponse.json({
      ok: true,
      data: {
        jobs: {
          available: jobsAvailable,
          awaitingAssignment: jobsAwaitingAssignment,
          assigned: jobsAssigned,
          completed: jobsCompleted,
        },
        routingUrgency: {
          count: routingUrgencyJobs.length,
          jobs: routingUrgencyJobs.map((j: any) => ({
            id: String(j.id),
            title: String(j.title ?? ""),
            country: String(j.country ?? ""),
            regionCode: String(j.regionCode ?? ""),
            city: j.city == null ? null : String(j.city),
            createdAt: (j.createdAt as Date)?.toISOString?.() ?? String(j.createdAt ?? ""),
          })),
        },
        flaggedJobs: flaggedJobs.map((j: any) => ({
          id: String(j.id),
          title: j.title == null ? null : String(j.title),
          city: j.city == null ? null : String(j.city),
          regionCode: j.regionCode == null ? null : String(j.regionCode),
          flagCount: Number(j.flagCount ?? 0),
        })),
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
        systemStatus: {
          jobsStuckOpenForRoutingOver48h: jobsOpenForRoutingOver48h,
          routerOnboardingFailures: routerOnboardingFailures,
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
