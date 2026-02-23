import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, desc, eq, isNull, or, sql, lt } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 300, 1), 500);

    async function count(q: Promise<unknown[]>): Promise<number> {
      const res = await q;
      return Number((res as any)?.[0]?.c ?? 0);
    }

    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const archivedExcluded = eq(jobs.archived, false);

    const activeStatusesWhere = or(
      eq(jobs.status, "ASSIGNED" as any),
      and(eq(jobs.status, "CUSTOMER_APPROVED" as any), isNull(jobs.router_approved_at)),
    );

    const [activeJobs, awaitingRouter, unassignedOver24h, adminOwnedJobs, jobRows] = await Promise.all([
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
          .where(and(archivedExcluded, eq(jobs.status, "CUSTOMER_APPROVED" as any), isNull(jobs.router_approved_at)))
      ),
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(jobs)
          .where(
            and(
              archivedExcluded,
              eq(jobs.status, "CUSTOMER_APPROVED" as any),
              isNull(jobs.router_approved_at),
              lt(jobs.created_at, cutoff24h),
            )
          )
      ),
      count(
        db
          .select({ c: sql<number>`count(*)` })
          .from(jobs)
          .where(and(archivedExcluded, eq(jobs.admin_routed_by_id, auth.userId)))
      ),
      db
        .select({
          id: jobs.id,
          status: jobs.status,
          title: jobs.title,
          jobSource: jobs.job_source,
          region: jobs.region,
          regionName: jobs.region_name,
          addressFull: jobs.address_full,
          city: jobs.city,
          publishedAt: jobs.published_at,
          routingStatus: jobs.routing_status,
          adminRoutedById: jobs.admin_routed_by_id,
          createdAt: jobs.created_at,
        })
        .from(jobs)
        .where(and(archivedExcluded, activeStatusesWhere))
        .orderBy(desc(jobs.published_at))
        .limit(limit),
    ]);

    const safeJobs = jobRows.map((j: any) => {
      const regionName = j.regionName ?? j.region ?? "";
      const region = j.region ?? j.regionName ?? "";
      const location = j.addressFull ?? j.city ?? region ?? "";
      return {
        id: j.id,
        location,
        regionName,
        region,
        router: j.adminRoutedById ?? "",
        status: j.status ?? "",
        jobSource: j.jobSource ?? "",
        createdAt: (j.createdAt as Date)?.toISOString?.() ?? String(j.createdAt ?? ""),
        title: j.title,
        publishedAt: (j.publishedAt as Date)?.toISOString?.() ?? String(j.publishedAt ?? ""),
        routingStatus: j.routingStatus ?? "",
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        activeJobs,
        awaitingRouter,
        unassignedOver24h,
        adminOwnedJobs,
        jobs: safeJobs,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/jobs/status", { route: "/api/admin/jobs/status", userId: auth.userId });
  }
}
