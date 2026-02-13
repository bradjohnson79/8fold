import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../src/auth/rbac";
import { toHttpError } from "../../../../src/http/errors";
// Use string literals for routing status to avoid runtime enum resolution issues in some environments.
import { and, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../../../db/drizzle";
import { jobDispatches } from "../../../../db/schema/jobDispatch";
import { jobs } from "../../../../db/schema/job";
import { routerProfiles } from "../../../../db/schema/routerProfile";
import { users } from "../../../../db/schema/user";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const dispatchCounts = db
      .select({
        jobId: jobDispatches.jobId,
        c: sql<number>`count(*)`.as("c"),
      })
      .from(jobDispatches)
      .where(inArray(jobDispatches.status, ["PENDING", "ACCEPTED", "DECLINED", "EXPIRED"] as any))
      .groupBy(jobDispatches.jobId)
      .as("dc");

    const routerUsers = alias(users, "routerUser");
    const adminUsers = alias(users, "adminUser");

    const rows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        region: jobs.region,
        status: jobs.status,
        routingStatus: jobs.routingStatus,
        routerId: jobs.claimedByUserId,
        adminRoutedById: jobs.adminRoutedById,
        routedAt: jobs.routedAt,
        firstRoutedAt: jobs.firstRoutedAt,
        claimedAt: jobs.claimedAt,
        guaranteeEligibleAt: jobs.guaranteeEligibleAt,
        contactedAt: jobs.contactedAt,
        publishedAt: jobs.publishedAt,

        routerEmail: routerUsers.email,
        routerName: routerProfiles.name,
        adminRoutedByEmail: adminUsers.email,
        dispatchedCount: dispatchCounts.c,
      })
      .from(jobs)
      .leftJoin(routerUsers, eq(routerUsers.id, jobs.claimedByUserId))
      .leftJoin(routerProfiles, eq(routerProfiles.userId, jobs.claimedByUserId))
      .leftJoin(adminUsers, eq(adminUsers.id, jobs.adminRoutedById))
      .leftJoin(dispatchCounts, eq(dispatchCounts.jobId, jobs.id))
      .where(
        or(
          ne(jobs.routingStatus, "UNROUTED"),
          isNotNull(jobs.claimedByUserId),
          isNotNull(jobs.routedAt),
          inArray(jobs.status, [
            "PUBLISHED",
            "OPEN_FOR_ROUTING",
            "ASSIGNED",
            "IN_PROGRESS",
            "CONTRACTOR_COMPLETED",
            "CUSTOMER_APPROVED",
            "CUSTOMER_REJECTED",
            "COMPLETION_FLAGGED",
            "COMPLETED_APPROVED",
          ] as any),
        ),
      )
      .orderBy(desc(jobs.routedAt), desc(jobs.publishedAt))
      .limit(200);

    // Transform to API response shape
    const transformed = rows.map((job: any) => ({
      id: job.id,
      title: job.title,
      region: job.region,
      status: job.status,
      routingStatus: (job as any).routingStatus ?? "UNROUTED",
      routerId: (job as any).routerId ?? null,
      routerName: (job as any).routerName ?? (job as any).routerEmail ?? null,
      routerEmail: (job as any).routerEmail ?? null,
      adminRoutedById: (job as any).adminRoutedById ?? null,
      adminRoutedByEmail: (job as any).adminRoutedByEmail ?? null,
      routedAt: (job as any).routedAt?.toISOString?.() ?? null,
      firstRoutedAt: (job as any).firstRoutedAt?.toISOString?.() ?? null,
      claimedAt: (job as any).claimedAt?.toISOString?.() ?? null,
      dispatchedContractorsCount: Math.min(Number((job as any).dispatchedCount ?? 0), 5),
      guaranteeEligibleAt: (job as any).guaranteeEligibleAt?.toISOString?.() ?? null,
      contactedAt: (job as any).contactedAt?.toISOString?.() ?? null,
      publishedAt: (job as any).publishedAt?.toISOString?.() ?? null,
    }));

    return NextResponse.json({ jobs: transformed });
  } catch (err) {
    const { status, message } = toHttpError(err);
    if (process.env.ADMIN_AUDIT_LOG === "1" && status >= 500) {
      const traceId = req.headers.get("x-admin-trace-id") ?? null;
      const pg: any = err && typeof err === "object" ? (err as any) : null;
      // eslint-disable-next-line no-console
      console.error("[ADMIN_AUDIT][API_500]", {
        traceId,
        method: req.method,
        path: new URL(req.url).pathname,
        message,
        err,
        stack: err instanceof Error ? err.stack : undefined,
        pg: pg
          ? {
              code: pg.code,
              detail: pg.detail,
              constraint: pg.constraint,
              column: pg.column,
              table: pg.table,
              schema: pg.schema,
            }
          : null,
      });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
