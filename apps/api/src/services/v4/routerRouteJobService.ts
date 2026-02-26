import crypto from "crypto";
import { randomUUID } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractors } from "@/db/schema/contractor";
import { jobDispatches } from "@/db/schema/jobDispatch";
import { jobs } from "@/db/schema/job";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";
import { users } from "@/db/schema/user";
import { haversineKm } from "@/src/jobs/geo";
import { serviceTypeToTradeCategory } from "@/src/contractors/tradeMap";
import { isSameJurisdiction, normalizeCountryCode, normalizeStateCode } from "@/src/jurisdiction";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export type RouteJobResult =
  | { kind: "ok"; created: Array<{ dispatchId: string; contractorId: string; token?: string }> }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "job_archived" }
  | { kind: "job_not_available" }
  | { kind: "pricing_unlocked" }
  | { kind: "cross_jurisdiction_blocked" }
  | { kind: "missing_job_coords" }
  | { kind: "too_many" }
  | { kind: "contractor_not_eligible" }
  | { kind: "contractor_missing_coords" };

export async function routeV4Job(
  routerUserId: string,
  jobId: string,
  contractorIds: string[],
): Promise<RouteJobResult> {
  const desired = Array.from(new Set(contractorIds)).slice(0, 5);

  return db.transaction(async (tx) => {
    const profileRows = await tx
      .select({
        homeCountryCode: routerProfilesV4.homeCountryCode,
        homeRegionCode: routerProfilesV4.homeRegionCode,
      })
      .from(routerProfilesV4)
      .where(eq(routerProfilesV4.userId, routerUserId))
      .limit(1);

    const profile = profileRows[0] ?? null;
    const routerCountryCode = profile?.homeCountryCode?.trim();
    const routerStateCode = profile?.homeRegionCode?.trim();

    if (!routerCountryCode || !routerStateCode) return { kind: "forbidden" };

    const jobRows = await tx
      .select({
        id: jobs.id,
        archived: jobs.archived,
        is_mock: jobs.is_mock,
        job_source: jobs.job_source,
        status: jobs.status,
        routing_status: jobs.routing_status,
        country: jobs.country,
        country_code: jobs.country_code,
        state_code: jobs.state_code,
        service_type: jobs.service_type,
        trade_category: jobs.trade_category,
        job_type: jobs.job_type,
        lat: jobs.lat,
        lng: jobs.lng,
        claimed_by_user_id: jobs.claimed_by_user_id,
        first_routed_at: jobs.first_routed_at,
        contractor_payout_cents: jobs.contractor_payout_cents,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    const job = jobRows[0] ?? null;
    if (!job) return { kind: "not_found" };
    if (job.archived) return { kind: "job_archived" };
    if (job.is_mock || job.job_source === "MOCK") return { kind: "job_not_available" };
    if (job.status !== "OPEN_FOR_ROUTING") return { kind: "job_not_available" };
    if (job.routing_status !== "UNROUTED") return { kind: "job_not_available" };
    if (job.claimed_by_user_id) return { kind: "job_not_available" };
    if (!job.contractor_payout_cents || Number(job.contractor_payout_cents) <= 0) return { kind: "pricing_unlocked" };

    const jobCountryCode = normalizeCountryCode(String(job.country_code ?? job.country ?? ""));
    const jobStateCode = normalizeStateCode(String(job.state_code ?? ""));
    if (!isSameJurisdiction(routerCountryCode, routerStateCode, jobCountryCode, jobStateCode)) {
      return { kind: "cross_jurisdiction_blocked" };
    }

    if (typeof job.lat !== "number" || typeof job.lng !== "number") return { kind: "missing_job_coords" };

    const isUS = String(job.country ?? "").toUpperCase() === "US";
    const milesToKm = (mi: number) => mi * 1.60934;
    const jobTypeLimitKm = job.job_type === "urban" ? (isUS ? milesToKm(30) : 50) : isUS ? milesToKm(60) : 100;

    const existingPending = await tx
      .select({ contractorId: jobDispatches.contractorId })
      .from(jobDispatches)
      .where(and(eq(jobDispatches.jobId, job.id), eq(jobDispatches.status, "PENDING"), sql`${jobDispatches.expiresAt} > now()`));
    const existingContractorIds = new Set(existingPending.map((d) => d.contractorId));
    const newIds = desired.filter((id) => !existingContractorIds.has(id));
    if (existingPending.length + newIds.length > 5) return { kind: "too_many" };

    const category = (job.trade_category ?? serviceTypeToTradeCategory(job.service_type)) as any;

    const contractorRows = await tx
      .select({
        id: contractors.id,
        status: contractors.status,
        tradeCategories: contractors.tradeCategories,
        automotiveEnabled: contractors.automotiveEnabled,
        regions: contractors.regions,
        countryCode: users.countryCode,
        stateCode: users.stateCode,
        lat: contractors.lat,
        lng: contractors.lng,
        serviceRadiusKm: contractorAccounts.serviceRadiusKm,
      })
      .from(contractors)
      .innerJoin(users, sql`lower(${users.email}) = lower(${contractors.email})`)
      .leftJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
      .where(and(eq(users.status, "ACTIVE"), inArray(contractors.id, desired as any)));
    const byId = new Map(contractorRows.map((c) => [c.id, c]));

    const created: Array<{ dispatchId: string; contractorId: string; token?: string }> = [];
    const allowEcho = process.env.ALLOW_DEV_OTP_ECHO === "true";
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    for (const contractorId of desired) {
      if (existingContractorIds.has(contractorId)) continue;
      const c = byId.get(contractorId);
      if (!c || c.status !== "APPROVED") return { kind: "contractor_not_eligible" };

      const tradeCategories = (c.tradeCategories ?? []) as any[];
      if (!tradeCategories.includes(category)) return { kind: "contractor_not_eligible" };
      if (String(category) === "AUTOMOTIVE" && !c.automotiveEnabled) return { kind: "contractor_not_eligible" };
      const contractorCountryCode = normalizeCountryCode(String((c as any).countryCode ?? ""));
      const contractorStateCode = normalizeStateCode(String((c as any).stateCode ?? ""));
      if (!isSameJurisdiction(contractorCountryCode, contractorStateCode, jobCountryCode, jobStateCode)) {
        return { kind: "cross_jurisdiction_blocked" };
      }

      if (typeof c.lat !== "number" || typeof c.lng !== "number") return { kind: "contractor_missing_coords" };
      const km = haversineKm({ lat: job.lat, lng: job.lng }, { lat: c.lat, lng: c.lng });
      const serviceRadiusKm = typeof c.serviceRadiusKm === "number" && c.serviceRadiusKm > 0 ? c.serviceRadiusKm : null;
      const effectiveRadiusKm = serviceRadiusKm !== null ? Math.min(jobTypeLimitKm, serviceRadiusKm) : jobTypeLimitKm;
      if (km > effectiveRadiusKm) return { kind: "contractor_not_eligible" };

      const rawToken = crypto.randomBytes(24).toString("hex");
      const tokenHash = sha256(rawToken);

      const dispatchId = randomUUID();
      await tx.insert(jobDispatches).values({
        id: dispatchId,
        createdAt: now,
        updatedAt: now,
        status: "PENDING",
        expiresAt,
        respondedAt: null,
        tokenHash,
        jobId: job.id,
        contractorId,
        routerUserId: routerUserId,
      });

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        createdAt: now,
        actorUserId: routerUserId,
        action: "JOB_DISPATCH_SENT",
        entityType: "Job",
        entityId: job.id,
        metadata: { dispatchId, contractorId, expiresAt: expiresAt.toISOString() } as any,
      });

      created.push({
        dispatchId,
        contractorId,
        token: process.env.NODE_ENV !== "production" && allowEcho ? rawToken : undefined,
      });
    }

    const updated = await tx
      .update(jobs)
      .set({
        claimed_by_user_id: routerUserId,
        claimed_at: now,
        routed_at: now,
        routing_status: "ROUTED_BY_ROUTER" as any,
        first_routed_at: (job.first_routed_at ?? now) as any,
      })
      .where(and(eq(jobs.id, job.id), eq(jobs.routing_status, "UNROUTED"), sql`${jobs.claimed_by_user_id} is null`))
      .returning({ id: jobs.id });
    if (updated.length !== 1) return { kind: "job_not_available" };

    await tx.insert(auditLogs).values({
      id: randomUUID(),
      createdAt: now,
      actorUserId: routerUserId,
      action: "JOB_ROUTING_APPLIED",
      entityType: "Job",
      entityId: job.id,
      metadata: { contractorIds: desired, createdDispatches: created.map((c) => c.dispatchId) } as any,
    });

    return { kind: "ok", created };
  });
}
