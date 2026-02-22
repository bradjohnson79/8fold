import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import crypto from "node:crypto";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { jobOverdueWhere } from "@/src/services/monitoringService";
import { db } from "../../../../../../db/drizzle";
import { adminRouterContexts } from "../../../../../../db/schema/adminRouterContext";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { jobs } from "../../../../../../db/schema/job";
import { routingHubs } from "../../../../../../db/schema/routingHub";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const ctxRows = await db
      .select({
        id: adminRouterContexts.id,
        country: adminRouterContexts.country,
        regionCode: adminRouterContexts.regionCode,
        hubCity: routingHubs.hubCity,
      })
      .from(adminRouterContexts)
      .innerJoin(routingHubs, eq(routingHubs.id, adminRouterContexts.routingHubId as any))
      .where(and(eq(adminRouterContexts.adminId, auth.userId), isNull(adminRouterContexts.deactivatedAt)))
      .orderBy(asc(adminRouterContexts.activatedAt))
      .limit(1);
    const ctx = ctxRows[0] ?? null;
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "no_active_context" }, { status: 409 });
    }

    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const take = 50;
    const now = new Date();

    let cursorDueAt: Date | null = null;
    if (cursor) {
      const cur = await db.select({ due: jobs.routing_due_at }).from(jobs).where(eq(jobs.id, cursor)).limit(1);
      cursorDueAt = cur[0]?.due ?? null;
    }

    const where = and(
      eq(jobs.country, ctx.country as any),
      eq(jobs.region_code, ctx.regionCode),
      eq(jobs.routing_status, "UNROUTED"),
      isNull(jobs.claimed_by_user_id),
      jobOverdueWhere({ routingDueAt: jobs.routing_due_at, postedAt: jobs.posted_at }, now),
      inArray(jobs.status, ["PUBLISHED", "OPEN_FOR_ROUTING"] as any),
      eq(jobs.is_mock, false),
      ...(cursor && cursorDueAt
        ? ([
            or(
              sql`${jobs.routing_due_at} > ${cursorDueAt}`,
              and(sql`${jobs.routing_due_at} = ${cursorDueAt}`, sql`${jobs.id} > ${cursor}`),
            ),
          ] as any[])
        : ([] as any[])),
    );

    const rows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        scope: jobs.scope,
        status: jobs.status,
        country: jobs.country,
        regionCode: jobs.region_code,
        region: jobs.region,
        serviceType: jobs.service_type,
        tradeCategory: jobs.trade_category,
        postedAt: jobs.posted_at,
        routingDueAt: jobs.routing_due_at,
        routingStatus: jobs.routing_status,
        failsafeRouting: jobs.failsafe_routing,
        laborTotalCents: jobs.labor_total_cents,
        materialsTotalCents: jobs.materials_total_cents,
        transactionFeeCents: jobs.transaction_fee_cents,
        routerEarningsCents: jobs.router_earnings_cents,
        brokerFeeCents: jobs.broker_fee_cents,
        contractorPayoutCents: jobs.contractor_payout_cents,
      })
      .from(jobs)
      .where(where)
      .orderBy(asc(jobs.routing_due_at), asc(jobs.id))
      .limit(take);

    // Audit: query + per-job view (<=50)
    await db.transaction(async (tx: any) => {
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "ADMIN_ROUTER_OVERDUE_LIST",
        entityType: "AdminRouterContext",
        entityId: ctx.id,
        metadata: {
          actorRole: "ADMIN",
          country: ctx.country,
          regionCode: ctx.regionCode,
          hubCity: ctx.hubCity,
          count: rows.length,
        } as any,
      });

      if (rows.length) {
        await tx.insert(auditLogs).values(
          rows.map((j: any) => ({
            id: crypto.randomUUID(),
            actorUserId: auth.userId,
            action: "ADMIN_ROUTER_JOB_VIEW",
            entityType: "Job",
            entityId: j.id,
            metadata: {
              actorRole: "ADMIN",
              country: j.country,
              regionCode: j.regionCode,
              routingDueAt: j.routingDueAt,
            } as any,
          })) as any,
        );
      }
    });

    const nextCursor = rows.length === take ? rows[rows.length - 1]?.id ?? null : null;

    return NextResponse.json({
      ok: true,
      data: {
        context: {
          country: ctx.country,
          regionCode: ctx.regionCode,
          hubCity: ctx.hubCity
        },
        jobs: rows,
        nextCursor
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/router/jobs/overdue");
  }
}

