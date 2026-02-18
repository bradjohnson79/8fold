import { NextResponse } from "next/server";
import { handleApiError } from "@/src/lib/errorHandler";
import crypto from "node:crypto";
import { and, eq, isNull, desc, ne, sql } from "drizzle-orm";
import { isJobOverdue, jobOverdueWhere } from "@/src/services/monitoringService";
import { db } from "../../../../../../../db/drizzle";
import { adminRouterContexts } from "../../../../../../../db/schema/adminRouterContext";
import { auditLogs } from "../../../../../../../db/schema/auditLog";
import { jobAssignments } from "../../../../../../../db/schema/jobAssignment";
import { jobs } from "../../../../../../../db/schema/job";
import { ledgerEntries } from "../../../../../../../db/schema/ledgerEntry";
import { routingHubs } from "../../../../../../../db/schema/routingHub";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { enforceTier, requireAdminIdentityWithTier } from "../../../../_lib/adminTier";

function getJobIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("jobs") + 1;
  return parts[idx] ?? "";
}

export async function POST(req: Request) {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof NextResponse) return identity;
  const forbidden = enforceTier(identity, "ADMIN_OPERATOR");
  if (forbidden) return forbidden;

  try {
    const jobId = getJobIdFromUrl(req);
    const now = new Date();
    const STALE_ASSIGNMENT_GRACE_MS = 5 * 60 * 1000;

    const ctxRows = await db
      .select({
        id: adminRouterContexts.id,
        country: adminRouterContexts.country,
        regionCode: adminRouterContexts.regionCode,
        hubCity: routingHubs.hubCity,
      })
      .from(adminRouterContexts)
      .innerJoin(routingHubs, eq(routingHubs.id, adminRouterContexts.routingHubId as any))
      .where(and(eq(adminRouterContexts.adminId, identity.userId), isNull(adminRouterContexts.deactivatedAt)))
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
        postedAt: jobs.postedAt,
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
        actorUserId: identity.userId,
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
        actorUserId: identity.userId,
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
        actorUserId: identity.userId,
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
        actorUserId: identity.userId,
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
        actorUserId: identity.userId,
        action: "ADMIN_ROUTER_ROUTE_ATTEMPT_NOT_UNROUTED",
        entityType: "Job",
        entityId: job.id,
        metadata: { actorRole: "ADMIN", routingStatus: job.routingStatus, routerId: job.routerUserId } as any,
      });
      return NextResponse.json({ ok: false, error: "job_already_routed" }, { status: 409 });
    }

    // Invariant: reroute must NOT occur once work is in progress.
    if (String(job.status ?? "").toUpperCase() === "IN_PROGRESS") {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: identity.userId,
        action: "ADMIN_ROUTER_ROUTE_ATTEMPT_IN_PROGRESS",
        entityType: "Job",
        entityId: job.id,
        metadata: { actorRole: "ADMIN", status: job.status } as any,
      });
      return NextResponse.json({ ok: false, error: "job_in_progress" }, { status: 409 });
    }

    // Routing status should not contradict lifecycle: only reroute jobs that are still pre-assignment.
    if (!["PUBLISHED", "OPEN_FOR_ROUTING"].includes(String(job.status ?? "").toUpperCase())) {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: identity.userId,
        action: "ADMIN_ROUTER_ROUTE_ATTEMPT_NOT_ROUTABLE_STATUS",
        entityType: "Job",
        entityId: job.id,
        metadata: { actorRole: "ADMIN", status: job.status } as any,
      });
      return NextResponse.json({ ok: false, error: "job_not_routable" }, { status: 409 });
    }

    // Invariant: reroute must NOT occur when a contractor is actively assigned.
    // (We also treat status=ASSIGNED as an "active contractor" signal, even if the assignment row is missing.)
    if (String(job.status ?? "").toUpperCase() === "ASSIGNED") {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: identity.userId,
        action: "ADMIN_ROUTER_ROUTE_ATTEMPT_ACTIVE_CONTRACTOR",
        entityType: "Job",
        entityId: job.id,
        metadata: { actorRole: "ADMIN", status: job.status } as any,
      });
      return NextResponse.json({ ok: false, error: "job_has_active_contractor" }, { status: 409 });
    }

    if (!isJobOverdue({ routingDueAt: job.routingDueAt, postedAt: job.postedAt }, now)) {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: identity.userId,
        action: "ADMIN_ROUTER_ROUTE_ATTEMPT_NOT_OVERDUE",
        entityType: "Job",
        entityId: job.id,
        metadata: { actorRole: "ADMIN", routingDueAt: job.routingDueAt } as any,
      });
      return NextResponse.json({ ok: false, error: "job_not_overdue" }, { status: 409 });
    }

    // Route job as admin, reserve router payout for admin (pending)
    const routed = await db.transaction(async (tx: any) => {
      const activeAssignment =
        (
          await tx
            .select({ id: jobAssignments.id, createdAt: jobAssignments.createdAt })
            .from(jobAssignments)
            .where(and(eq(jobAssignments.jobId, job.id), eq(jobAssignments.status, "ASSIGNED")))
            .limit(1)
        )[0] ?? null;
      if (activeAssignment) {
        // Stale-assignment defense:
        // - If lifecycle says ASSIGNED/IN_PROGRESS, always block (handled above, but keep for safety).
        // - If lifecycle does NOT say assigned/in-progress, treat ASSIGNED rows as blocking only briefly
        //   to avoid races with an assignment just being created in a concurrent transaction.
        const ageMs = now.getTime() - new Date(activeAssignment.createdAt).getTime();
        if (ageMs <= STALE_ASSIGNMENT_GRACE_MS) {
          return { kind: "has_active_contractor" as const };
        }

        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
            actorUserId: identity.userId,
          action: "ADMIN_ROUTER_ROUTE_STALE_ASSIGNMENT_IGNORED",
          entityType: "Job",
          entityId: job.id,
          metadata: {
            actorRole: "ADMIN",
            assignmentId: activeAssignment.id,
            assignmentCreatedAt: new Date(activeAssignment.createdAt).toISOString(),
            ageMs,
          } as any,
        });
      }

      const updatedRows = await tx
        .update(jobs)
        .set({
          routingStatus: "ROUTED_BY_ADMIN",
          adminRoutedById: identity.userId,
          claimedByUserId: null,
          failsafeRouting: true,
          // firstRoutedAt is immutable once set, even under concurrent reroutes.
          firstRoutedAt: sql`coalesce(${jobs.firstRoutedAt}, ${now})` as any,
          routedAt: now,
        } as any)
        .where(
          and(
            eq(jobs.id, job.id),
            eq(jobs.routingStatus, "UNROUTED"),
            isNull(jobs.claimedByUserId),
            ne(jobs.status, "IN_PROGRESS" as any),
            ne(jobs.status, "ASSIGNED" as any),
            // Re-check overdue at update time to avoid racey early reroutes.
            jobOverdueWhere({ routingDueAt: jobs.routingDueAt, postedAt: jobs.postedAt }, now),
          ),
        )
        .returning({ id: jobs.id, routingStatus: jobs.routingStatus, adminRoutedById: jobs.adminRoutedById, firstRoutedAt: jobs.firstRoutedAt });
      const updated = updatedRows[0] as any;
      if (!updated) return { kind: "stale" as const };

      await tx.insert(ledgerEntries).values({
        id: crypto.randomUUID(),
        userId: identity.userId,
        jobId: job.id,
        type: "ROUTER_EARNING",
        direction: "CREDIT",
        bucket: "PENDING",
        amountCents: job.routerEarningsCents,
        memo: "Admin routed overdue job (pending router payout reservation)",
      } as any);

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: identity.userId,
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

      return { kind: "ok" as const, updated };
    });

    if ((routed as any)?.kind === "has_active_contractor") {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: identity.userId,
        action: "ADMIN_ROUTER_ROUTE_ATTEMPT_ACTIVE_CONTRACTOR",
        entityType: "Job",
        entityId: job.id,
        metadata: { actorRole: "ADMIN" } as any,
      });
      return NextResponse.json({ ok: false, error: "job_has_active_contractor" }, { status: 409 });
    }
    if ((routed as any)?.kind === "stale") {
      // Another actor updated the job between read and write.
      // Treat as conflict rather than silently routing.
      return NextResponse.json({ ok: false, error: "conflict" }, { status: 409 });
    }

    await adminAuditLog(req, { userId: identity.userId, role: "ADMIN" }, {
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

    return NextResponse.json({ ok: true, data: { job: (routed as any).updated } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/router/jobs/[jobId]/route");
  }
}

