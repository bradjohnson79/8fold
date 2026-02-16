import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import crypto from "node:crypto";
import { and, eq, isNull, lt, desc } from "drizzle-orm";
import { db } from "../../../../../../../db/drizzle";
import { adminRouterContexts } from "../../../../../../../db/schema/adminRouterContext";
import { auditLogs } from "../../../../../../../db/schema/auditLog";
import { jobs } from "../../../../../../../db/schema/job";
import { ledgerEntries } from "../../../../../../../db/schema/ledgerEntry";
import { routingHubs } from "../../../../../../../db/schema/routingHub";
import { adminAuditLog } from "@/src/audit/adminAudit";

function getJobIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("jobs") + 1;
  return parts[idx] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const jobId = getJobIdFromUrl(req);
    const now = new Date();

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
      .orderBy(desc(adminRouterContexts.activatedAt))
      .limit(1);
    const ctx = ctxRows[0] ?? null;
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "no_active_context" }, { status: 409 });
    }

    const jobRows = await db
      .select({
        id: jobs.id,
        archived: jobs.archived,
        status: jobs.status,
        country: jobs.country,
        regionCode: jobs.regionCode,
        isMock: jobs.isMock,
        routingStatus: jobs.routingStatus,
        routerUserId: jobs.claimedByUserId,
        routingDueAt: jobs.routingDueAt,
        firstRoutedAt: jobs.firstRoutedAt,
        routerEarningsCents: jobs.routerEarningsCents,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "ADMIN_ROUTER_ROUTE_ATTEMPT_NOT_FOUND",
        entityType: "Job",
        entityId: jobId,
        metadata: { actorRole: "ADMIN", country: ctx.country, regionCode: ctx.regionCode } as any,
      });
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (job.isMock) {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "ADMIN_ROUTER_ROUTE_ATTEMPT_MOCK_JOB",
        entityType: "Job",
        entityId: jobId,
        metadata: { actorRole: "ADMIN", country: ctx.country, regionCode: ctx.regionCode } as any,
      });
      return NextResponse.json({ ok: false, error: "mock_jobs_cannot_be_routed" }, { status: 409 });
    }
    if (job.archived) {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "ADMIN_ROUTER_ROUTE_ATTEMPT_ARCHIVED_JOB",
        entityType: "Job",
        entityId: job.id,
        metadata: { actorRole: "ADMIN", country: ctx.country, regionCode: ctx.regionCode } as any,
      });
      return NextResponse.json({ ok: false, error: "archived_jobs_cannot_be_routed" }, { status: 409 });
    }

    // Context scoping
    if (job.country !== ctx.country || (job.regionCode ?? "").toUpperCase() !== ctx.regionCode.toUpperCase()) {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "ADMIN_ROUTER_ROUTE_ATTEMPT_WRONG_REGION",
        entityType: "Job",
        entityId: job.id,
        metadata: {
          actorRole: "ADMIN",
          ctxCountry: ctx.country,
          ctxRegionCode: ctx.regionCode,
          jobCountry: job.country,
          jobRegionCode: job.regionCode,
        } as any,
      });
      return NextResponse.json({ ok: false, error: "job_not_in_context_region" }, { status: 403 });
    }

    // Overdue + unrouted enforcement
    if (job.routingStatus !== "UNROUTED" || job.routerUserId) {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "ADMIN_ROUTER_ROUTE_ATTEMPT_NOT_UNROUTED",
        entityType: "Job",
        entityId: job.id,
        metadata: { actorRole: "ADMIN", routingStatus: job.routingStatus, routerId: job.routerUserId } as any,
      });
      return NextResponse.json({ ok: false, error: "job_already_routed" }, { status: 409 });
    }

    if (!job.routingDueAt || now.getTime() <= job.routingDueAt.getTime()) {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "ADMIN_ROUTER_ROUTE_ATTEMPT_NOT_OVERDUE",
        entityType: "Job",
        entityId: job.id,
        metadata: { actorRole: "ADMIN", routingDueAt: job.routingDueAt } as any,
      });
      return NextResponse.json({ ok: false, error: "job_not_overdue" }, { status: 409 });
    }

    // Route job as admin, reserve router payout for admin (pending)
    const routed = await db.transaction(async (tx: any) => {
      const updatedRows = await tx
        .update(jobs)
        .set({
          routingStatus: "ROUTED_BY_ADMIN",
          adminRoutedById: auth.userId,
          claimedByUserId: null,
          failsafeRouting: true,
          firstRoutedAt: (job.firstRoutedAt ?? now) as any,
          routedAt: now,
        } as any)
        .where(eq(jobs.id, job.id))
        .returning({ id: jobs.id, routingStatus: jobs.routingStatus, adminRoutedById: jobs.adminRoutedById, firstRoutedAt: jobs.firstRoutedAt });
      const updated = updatedRows[0] as any;

      await tx.insert(ledgerEntries).values({
        id: crypto.randomUUID(),
        userId: auth.userId,
        jobId: job.id,
        type: "ROUTER_EARNING",
        direction: "CREDIT",
        bucket: "PENDING",
        amountCents: job.routerEarningsCents,
        memo: "Admin routed overdue job (pending router payout reservation)",
      } as any);

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "ADMIN_ROUTER_JOB_ROUTED",
        entityType: "Job",
        entityId: job.id,
        metadata: {
          actorRole: "ADMIN",
          country: ctx.country,
          regionCode: ctx.regionCode,
          hubCity: ctx.hubCity,
          routingStatus: "ROUTED_BY_ADMIN",
          routerPayoutReservedCents: job.routerEarningsCents,
        } as any,
      });

      return updated;
    });

    await adminAuditLog(req, auth, {
      action: "ADMIN_MANUAL_ROUTING",
      entityType: "Job",
      entityId: jobId,
      metadata: {
        country: ctx.country,
        regionCode: ctx.regionCode,
        hubCity: ctx.hubCity,
        routingStatus: "ROUTED_BY_ADMIN",
      },
    });

    return NextResponse.json({ ok: true, data: { job: routed } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/router/jobs/[jobId]/route");
  }
}

