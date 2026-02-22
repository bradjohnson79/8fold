import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../db/schema/auditLog";
import { jobs } from "../../db/schema/job";
import { routers } from "../../db/schema/router";
import { users } from "../../db/schema/user";
import { isSameJurisdiction, normalizeCountryCode, normalizeStateCode } from "../jurisdiction";

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
        countryCode: users.countryCode,
        stateCode: users.stateCode,
        dailyRouteLimit: routers.dailyRouteLimit,
      })
      .from(routers)
      .innerJoin(users, eq(users.id, routers.userId))
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
      .where(and(eq(jobs.claimed_by_user_id, userId), sql`${jobs.claimed_at} >= ${start}`, sql`${jobs.claimed_at} < ${end}`));
    const claimedToday = Number((claimedTodayRows[0] as any)?.count ?? 0);
    if (claimedToday >= Number(router.dailyRouteLimit ?? 0)) {
      throw Object.assign(new Error("Daily route limit exceeded"), { status: 429 });
    }

    const activeRows = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.claimed_by_user_id, userId), inArray(jobs.status, [...ACTIVE_STATUSES] as any)))
      .limit(1);
    const active = activeRows[0] ?? null;
    if (active) return { kind: "already_active", activeJobId: active.id };

    const currentRows = await tx
      .select({
        id: jobs.id,
        archived: jobs.archived,
        status: jobs.status,
        claimedByUserId: jobs.claimed_by_user_id,
        routingStatus: jobs.routing_status,
        firstRoutedAt: jobs.first_routed_at,
        country: jobs.country,
        countryCode: jobs.country_code,
        regionCode: jobs.region_code,
        stateCode: jobs.state_code,
        region: jobs.region,
        isMock: jobs.is_mock,
        jobSource: jobs.job_source,
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
    const routerCountryCode = normalizeCountryCode(String((router as any).countryCode ?? router.homeCountry ?? ""));
    const routerStateCode = normalizeStateCode(String((router as any).stateCode ?? router.homeRegionCode ?? ""));
    const jobCountryCode = normalizeCountryCode(String((current as any).countryCode ?? current.country ?? ""));
    const jobStateCode = normalizeStateCode(String((current as any).stateCode ?? current.regionCode ?? ""));
    if (!isSameJurisdiction(routerCountryCode, routerStateCode, jobCountryCode, jobStateCode)) {
      throw Object.assign(new Error("8Fold restricts work to within your registered state/province."), {
        status: 403,
        code: "CROSS_JURISDICTION_BLOCKED",
      });
    }

    const updated = await tx
      .update(jobs)
      .set({
        claimed_at: now,
        claimed_by_user_id: userId,
        contacted_at: now,
        routing_status: "ROUTED_BY_ROUTER" as any,
        first_routed_at: (current.firstRoutedAt ?? now) as any,
        routed_at: now,
      } as any)
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.archived, false),
          inArray(jobs.status, ["PUBLISHED", "OPEN_FOR_ROUTING"] as any),
          eq(jobs.routing_status, "UNROUTED"),
          sql`${jobs.claimed_by_user_id} is null`,
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

