import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../db/schema/auditLog";
import { jobs } from "../../db/schema/job";
import { routers } from "../../db/schema/router";
import { stateFromRegion } from "../jobs/geo";

const ACTIVE_STATUSES = [
  "PUBLISHED",
  "ASSIGNED",
  "IN_PROGRESS",
  "CONTRACTOR_COMPLETED",
  "CUSTOMER_APPROVED",
  "CUSTOMER_REJECTED",
  "COMPLETION_FLAGGED"
] as const;

export type ClaimJobResult =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "already_active"; activeJobId: string }
  | { kind: "already_claimed" }
  | { kind: "job_not_open" };

export async function claimJob(userId: string, jobId: string): Promise<ClaimJobResult> {
  return await db.transaction(async (tx) => {
    const routerRows = await tx
      .select({
        status: routers.status,
        homeCountry: routers.homeCountry,
        homeRegionCode: routers.homeRegionCode,
        dailyRouteLimit: routers.dailyRouteLimit,
      })
      .from(routers)
      .where(eq(routers.userId, userId))
      .limit(1);
    const router = routerRows[0] ?? null;
    if (!router || router.status !== "ACTIVE") {
      throw Object.assign(new Error("Router not active"), { status: 403 });
    }

    // Enforce daily routing limit (UTC day boundary; deterministic).
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
    const claimedTodayRows = await tx
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(and(eq(jobs.claimedByUserId, userId), sql`${jobs.claimedAt} >= ${start}`, sql`${jobs.claimedAt} < ${end}`));
    const claimedToday = Number((claimedTodayRows[0] as any)?.count ?? 0);
    if (claimedToday >= Number(router.dailyRouteLimit ?? 0)) {
      throw Object.assign(new Error("Daily route limit exceeded"), { status: 429 });
    }

    const activeRows = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.claimedByUserId, userId), inArray(jobs.status, [...ACTIVE_STATUSES] as any)))
      .limit(1);
    const active = activeRows[0] ?? null;
    if (active) return { kind: "already_active", activeJobId: active.id };

    const currentRows = await tx
      .select({
        id: jobs.id,
        archived: jobs.archived,
        status: jobs.status,
        claimedByUserId: jobs.claimedByUserId,
        routingStatus: jobs.routingStatus,
        firstRoutedAt: jobs.firstRoutedAt,
        country: jobs.country,
        regionCode: jobs.regionCode,
        region: jobs.region,
        isMock: jobs.isMock,
        jobSource: jobs.jobSource,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const current = currentRows[0] ?? null;
    if (!current) return { kind: "not_found" };

    // CRITICAL: Mock jobs can NEVER be claimed or routed
    if (current.isMock || current.jobSource === "MOCK") {
      throw Object.assign(new Error("Mock jobs cannot be claimed"), { status: 403 });
    }
    if (current.archived) {
      throw Object.assign(new Error("Archived jobs cannot be claimed"), { status: 409 });
    }

    if (current.claimedByUserId && current.claimedByUserId !== userId) {
      return { kind: "already_claimed" };
    }

    if (current.status !== "PUBLISHED" && current.status !== "OPEN_FOR_ROUTING") {
      return { kind: "job_not_open" };
    }
    if (current.routingStatus !== "UNROUTED") return { kind: "job_not_open" };

    // Enforce router region restriction.
    const jobRegionCode = String((current as any).regionCode ?? stateFromRegion(current.region)).trim().toUpperCase();
    if (router.homeCountry !== (current as any).country || String(router.homeRegionCode) !== jobRegionCode) {
      throw Object.assign(new Error("Router region mismatch"), { status: 403 });
    }

    const updated = await tx
      .update(jobs)
      .set({
        claimedAt: now,
        claimedByUserId: userId,
        contactedAt: now,
        routingStatus: "ROUTED_BY_ROUTER" as any,
        firstRoutedAt: (current.firstRoutedAt ?? now) as any,
        routedAt: now,
      } as any)
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.archived, false),
          inArray(jobs.status, ["PUBLISHED", "OPEN_FOR_ROUTING"] as any),
          eq(jobs.routingStatus, "UNROUTED"),
          sql`${jobs.claimedByUserId} is null`,
        ),
      )
      .returning({ id: jobs.id });

    if (updated.length !== 1) return { kind: "job_not_open" };

    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorUserId: userId,
      action: "JOB_CLAIM",
      entityType: "Job",
      entityId: jobId,
      metadata: { status: current.status } as any,
    });

    return { kind: "ok" };
  });
}

