import { randomUUID } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { jobs } from "@/db/schema/job";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";
import { v4EventOutbox } from "@/db/schema/v4EventOutbox";
import { v4ContractorTradeSkills } from "@/db/schema/v4ContractorTradeSkills";
import { v4ContractorCertifications } from "@/db/schema/v4ContractorCertifications";
import { haversineKm } from "@/src/jobs/geo";
import { ROUTING_STATUS } from "@/src/router/routingStatus";
import { geoBoundingBox } from "@/src/utils/geoBoundingBox";
import { getRoleCompletionSnapshot } from "@/src/services/v4/roleCompletionService";

export type ContractorCertificationPreview = {
  certificationName: string;
  issuingOrganization: string | null;
  verified: boolean;
  certificateType: string | null;
};

export type Stage2ContractorCard = {
  contractorId: string;
  businessName: string;
  contactName: string;
  tradeCategory: string;
  yearsExperience: number;
  city: string;
  distanceKm: number;
  availabilityStatus: "AVAILABLE" | "BUSY";
  certifications: ContractorCertificationPreview[];
};

type Stage2JobSnapshot = {
  id: string;
  title: string;
  city: string;
  region: string;
  provinceCode: string;
  countryCode: string;
  regionCode: string;
  tradeCategory: string;
  jobType: "urban" | "regional";
  isRegional: boolean;
  status: string;
  routingStatus: string;
  claimedByUserId: string | null;
  cancelRequestPending: boolean | null;
  lat: number;
  lng: number;
};

export type Stage2GetContractorsResult =
  | {
      kind: "ok";
      job: {
        id: string;
        title: string;
        city: string;
        region: string;
        provinceCode: string;
        tradeCategory: string;
        urbanOrRegional: "URBAN" | "REGIONAL";
        maxDistanceKm: number;
      };
      contractors: Stage2ContractorCard[];
    }
  | { kind: "not_found" }
  | { kind: "job_not_available" }
  | { kind: "missing_job_coords" };

export type Stage2RouteResult =
  | { kind: "ok"; created: number }
  | { kind: "not_found" }
  | { kind: "job_not_available" }
  | { kind: "missing_job_coords" }
  | { kind: "too_many" }
  | { kind: "contractor_not_eligible" }
  | { kind: "payment_setup_required" };

function normalizeProvinceCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeCountryCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeRegionCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase().replace(/[\s._-]+/g, "");
}

function normalizeTradeCategory(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function parseTradeCategories(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((value) => normalizeTradeCategory(String(value ?? ""))).filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => normalizeTradeCategory(String(value ?? ""))).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return [];
}

function resolveMaxDistanceKm(isRegional: boolean): number {
  return isRegional ? 100 : 50;
}

async function fetchJobSnapshot(jobId: string): Promise<Stage2JobSnapshot | null> {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      city: jobs.city,
      region: jobs.region,
      provinceCode: jobs.state_code,
      countryCode: jobs.country_code,
      regionCode: jobs.region_code,
      tradeCategory: jobs.trade_category,
      jobType: jobs.job_type,
      isRegional: jobs.is_regional,
      status: jobs.status,
      routingStatus: jobs.routing_status,
      claimedByUserId: jobs.claimed_by_user_id,
      cancelRequestPending: jobs.cancel_request_pending,
      lat: jobs.lat,
      lng: jobs.lng,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) return null;

  const isRegional = Boolean(row.isRegional);
  const countryCode = normalizeCountryCode(row.countryCode ?? "");
  const regionCode = normalizeRegionCode(row.regionCode ?? row.provinceCode ?? "");

  if (typeof row.lat !== "number" || !Number.isFinite(row.lat) || typeof row.lng !== "number" || !Number.isFinite(row.lng)) {
    return {
      id: row.id,
      title: row.title,
      city: row.city ?? "",
      region: row.region ?? "",
      provinceCode: normalizeProvinceCode(row.provinceCode),
      countryCode,
      regionCode,
      tradeCategory: normalizeTradeCategory(row.tradeCategory),
      jobType: row.jobType,
      isRegional,
      status: row.status,
      routingStatus: String(row.routingStatus ?? ""),
      claimedByUserId: row.claimedByUserId ?? null,
      cancelRequestPending: row.cancelRequestPending ?? null,
      lat: Number.NaN,
      lng: Number.NaN,
    };
  }

  return {
    id: row.id,
    title: row.title,
    city: row.city ?? "",
    region: row.region ?? "",
    provinceCode: normalizeProvinceCode(row.provinceCode),
    countryCode,
    regionCode,
    tradeCategory: normalizeTradeCategory(row.tradeCategory),
    jobType: row.jobType,
    isRegional,
    status: row.status,
    routingStatus: String(row.routingStatus ?? ""),
    claimedByUserId: row.claimedByUserId ?? null,
    cancelRequestPending: row.cancelRequestPending ?? null,
    lat: row.lat,
    lng: row.lng,
  };
}

async function computeEligibleContractors(job: Stage2JobSnapshot): Promise<Stage2ContractorCard[]> {
  if (!job.countryCode || !job.regionCode) return [];

  const maxDistanceKm = resolveMaxDistanceKm(job.isRegional);
  const bounds = geoBoundingBox(job.lat, job.lng, maxDistanceKm);

  // SQL-level trade filter: INNER JOIN v4_contractor_trade_skills on approved trade matching the job's category.
  // Because both columns use the TradeCategory pgEnum, this is a direct equality — no UPPER/TRIM needed.
  const tradeCategory = job.tradeCategory as typeof v4ContractorTradeSkills.$inferInsert["tradeCategory"];

  const rows = await db
    .select({
      contractorId: contractorProfilesV4.userId,
      businessName: contractorProfilesV4.businessName,
      contactName: contractorProfilesV4.contactName,
      tradeSkillId: v4ContractorTradeSkills.id,
      tradeYearsExperience: v4ContractorTradeSkills.yearsExperience,
      city: contractorProfilesV4.city,
      homeLatitude: contractorProfilesV4.homeLatitude,
      homeLongitude: contractorProfilesV4.homeLongitude,
    })
    .from(contractorProfilesV4)
    .innerJoin(contractorAccounts, eq(contractorAccounts.userId, contractorProfilesV4.userId))
    .innerJoin(
      v4ContractorTradeSkills,
      and(
        eq(v4ContractorTradeSkills.contractorUserId, contractorProfilesV4.userId),
        eq(v4ContractorTradeSkills.tradeCategory, tradeCategory),
        eq(v4ContractorTradeSkills.approved, true),
      ),
    )
    .where(
      and(
        sql`upper(trim(coalesce(${contractorProfilesV4.countryCode}, ''))) = ${job.countryCode}`,
        sql`upper(trim(coalesce(${contractorProfilesV4.homeRegionCode}, ''))) = ${job.regionCode}`,
        sql`${contractorProfilesV4.homeLatitude} BETWEEN ${bounds.latMin} AND ${bounds.latMax}`,
        sql`${contractorProfilesV4.homeLongitude} BETWEEN ${bounds.lngMin} AND ${bounds.lngMax}`,
      ),
    )
    .limit(500);

  const out: Stage2ContractorCard[] = [];
  for (const row of rows) {
    if (
      typeof row.homeLatitude !== "number" ||
      !Number.isFinite(row.homeLatitude) ||
      typeof row.homeLongitude !== "number" ||
      !Number.isFinite(row.homeLongitude)
    ) {
      continue;
    }

    const distanceKm = haversineKm({ lat: job.lat, lng: job.lng }, { lat: row.homeLatitude, lng: row.homeLongitude });
    if (!Number.isFinite(distanceKm) || distanceKm > maxDistanceKm) continue;

    out.push({
      contractorId: row.contractorId,
      businessName: String(row.businessName ?? "").trim() || String(row.contactName ?? "").trim() || "Contractor",
      contactName: String(row.contactName ?? "").trim() || String(row.businessName ?? "").trim() || "Contractor",
      tradeCategory: job.tradeCategory,
      yearsExperience: Number(row.tradeYearsExperience ?? 0),
      city: String(row.city ?? "").trim(),
      distanceKm,
      availabilityStatus: "AVAILABLE",
      certifications: [],
    });
  }

  // Batch-load certifications for all eligible contractors
  if (out.length > 0) {
    const contractorIds = out.map((c) => c.contractorId);
    const certRows = await db
      .select({
        contractorUserId: v4ContractorCertifications.contractorUserId,
        tradeSkillId: v4ContractorCertifications.tradeSkillId,
        certificationName: v4ContractorCertifications.certificationName,
        issuingOrganization: v4ContractorCertifications.issuingOrganization,
        verified: v4ContractorCertifications.verified,
        certificateType: v4ContractorCertifications.certificateType,
      })
      .from(v4ContractorCertifications)
      .innerJoin(
        v4ContractorTradeSkills,
        and(
          eq(v4ContractorCertifications.tradeSkillId, v4ContractorTradeSkills.id),
          eq(v4ContractorTradeSkills.tradeCategory, tradeCategory),
        ),
      )
      .where(inArray(v4ContractorCertifications.contractorUserId, contractorIds));

    const certsByContractor = new Map<string, ContractorCertificationPreview[]>();
    for (const cert of certRows) {
      const existing = certsByContractor.get(cert.contractorUserId) ?? [];
      existing.push({
        certificationName: cert.certificationName,
        issuingOrganization: cert.issuingOrganization,
        verified: cert.verified,
        certificateType: cert.certificateType,
      });
      certsByContractor.set(cert.contractorUserId, existing);
    }

    for (const c of out) {
      c.certifications = certsByContractor.get(c.contractorId) ?? [];
    }
  }

  const contractorIds = out.map((c) => c.contractorId);
  if (contractorIds.length > 0) {
    const activeJobs = await db
      .select({
        contractorUserId: jobs.contractor_user_id,
        count: sql<number>`count(*)::int`,
      })
      .from(jobs)
      .where(
        and(
          inArray(jobs.contractor_user_id, contractorIds),
          inArray(jobs.status, ["ASSIGNED", "IN_PROGRESS", "JOB_STARTED"]),
        ),
      )
      .groupBy(jobs.contractor_user_id);

    const busySet = new Set(activeJobs.map((r) => r.contractorUserId));
    for (const c of out) {
      c.availabilityStatus = busySet.has(c.contractorId) ? "BUSY" : "AVAILABLE";
    }
  }

  out.sort((a, b) => {
    const availDiff =
      (a.availabilityStatus === "AVAILABLE" ? 0 : 1) -
      (b.availabilityStatus === "AVAILABLE" ? 0 : 1);
    if (availDiff !== 0) return availDiff;
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.businessName.localeCompare(b.businessName);
  });

  return out;
}

export async function getStage2JobContractors(jobId: string, routerUserId?: string): Promise<Stage2GetContractorsResult> {
  const job = await fetchJobSnapshot(jobId);

  console.error("[stage2-contractors-debug]", {
    jobId,
    exists: !!job,
    status: job?.status,
    routingStatus: job?.routingStatus,
    claimedByUserId: job?.claimedByUserId,
    cancelRequestPending: job?.cancelRequestPending,
    lat: job?.lat,
    lng: job?.lng,
    latFinite: Number.isFinite(job?.lat),
    lngFinite: Number.isFinite(job?.lng),
  });

  if (!job) {
    console.error("[stage2-contractors-debug] job not found", { jobId });
    return { kind: "not_found" };
  }

  if (job.status !== "OPEN_FOR_ROUTING" || job.cancelRequestPending === true) {
    console.error("[stage2-contractors-debug] job_not_available", {
      jobId,
      status: job.status,
      cancelRequestPending: job.cancelRequestPending,
    });
    return { kind: "job_not_available" };
  }

  const claimedByOther = job.claimedByUserId !== null && job.claimedByUserId !== routerUserId;
  if (claimedByOther) {
    console.error("[stage2-contractors-debug] job_not_available (claimed by another router)", {
      jobId,
      claimedByUserId: job.claimedByUserId,
      routerUserId,
    });
    return { kind: "job_not_available" };
  }

  if (!Number.isFinite(job.lat) || !Number.isFinite(job.lng)) {
    console.error("[stage2-contractors-debug] missing_job_coords", {
      jobId,
      lat: job.lat,
      lng: job.lng,
    });
    return { kind: "missing_job_coords" };
  }

  console.error("[stage2-contractors-debug] contractor discovery starting", {
    jobId,
    lat: job.lat,
    lng: job.lng,
    tradeCategory: job.tradeCategory,
    regionCode: job.regionCode,
    countryCode: job.countryCode,
  });

  const contractors = await computeEligibleContractors(job);
  return {
    kind: "ok",
    job: {
      id: job.id,
      title: job.title,
      city: job.city,
      region: job.region,
      provinceCode: job.provinceCode,
      tradeCategory: job.tradeCategory,
      urbanOrRegional: job.jobType === "urban" ? "URBAN" : "REGIONAL",
      maxDistanceKm: resolveMaxDistanceKm(job.isRegional),
    },
    contractors,
  };
}

export async function routeStage2JobToContractors(
  routerUserId: string,
  jobId: string,
  contractorIds: string[],
): Promise<Stage2RouteResult> {
  const snapshot = await getRoleCompletionSnapshot(routerUserId, "ROUTER");

  if (!snapshot || !snapshot.hasCompletedRouterPaymentSetup) {
    return { kind: "payment_setup_required" };
  }

  const desired = Array.from(new Set(contractorIds)).filter(Boolean);

  if (!desired.length) {
    return { kind: "contractor_not_eligible" };
  }

  if (desired.length > 5) return { kind: "too_many" };

  const eligible = await getStage2JobContractors(jobId, routerUserId);
  if (eligible.kind === "not_found") return { kind: "not_found" };
  if (eligible.kind === "job_not_available") return { kind: "job_not_available" };
  if (eligible.kind === "missing_job_coords") return { kind: "missing_job_coords" };

  const eligibleIds = new Set(eligible.contractors.map((c) => c.contractorId));
  if (desired.some((contractorId) => !eligibleIds.has(contractorId))) {
    return { kind: "contractor_not_eligible" };
  }

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select id from jobs where id = ${jobId} for update`);

      const countRes = await tx.execute(
        sql`SELECT COUNT(*)::int AS cnt FROM v4_contractor_job_invites WHERE job_id = ${jobId} AND status = 'PENDING'`
      );
      const existingCount = Number((countRes.rows[0] as any)?.cnt ?? 0);
      if (existingCount >= 5 || existingCount + desired.length > 5) return { kind: "job_not_available" as const };

      const existingRows = await tx
        .select({ contractorUserId: v4ContractorJobInvites.contractorUserId })
        .from(v4ContractorJobInvites)
        .where(and(
          eq(v4ContractorJobInvites.jobId, jobId),
          inArray(v4ContractorJobInvites.contractorUserId, desired as any),
          eq(v4ContractorJobInvites.status, "PENDING"),
        ));
      if (existingRows.length > 0) return { kind: "contractor_not_eligible" as const };

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const updated = await tx
        .update(jobs)
        .set({
          claimed_by_user_id: routerUserId,
          claimed_at: now,
          routed_at: now,
          routing_status: ROUTING_STATUS.INVITES_SENT as any,
          routing_started_at: now,
          routing_expires_at: expiresAt,
        })
        .where(
          and(
            eq(jobs.id, jobId),
            eq(jobs.status, "OPEN_FOR_ROUTING"),
            eq(jobs.cancel_request_pending, false),
            sql`(${jobs.claimed_by_user_id} is null or ${jobs.claimed_by_user_id} = ${routerUserId})`,
          ),
        )
        .returning({ id: jobs.id });
      if (updated.length !== 1) return { kind: "job_not_available" as const };
      for (const contractorId of desired) {
        await tx
          .insert(v4ContractorJobInvites)
          .values({
            id: randomUUID(),
            routeId: routerUserId,
            jobId,
            contractorUserId: contractorId,
            status: "PENDING",
            createdAt: now,
            expiresAt,
            respondedAt: null,
          })
          .onConflictDoUpdate({
            target: [v4ContractorJobInvites.jobId, v4ContractorJobInvites.contractorUserId],
            set: {
              status: "PENDING",
              routeId: routerUserId,
              createdAt: now,
              expiresAt,
              respondedAt: null,
            },
          });

        await tx.insert(v4EventOutbox).values({
          id: randomUUID(),
          eventType: "ROUTER_JOB_ROUTED",
          payload: {
            jobId,
            contractorId,
            createdAt: now.toISOString(),
            dedupeKey: `new_job_invite:${jobId}:${contractorId}`,
          } as Record<string, unknown>,
          createdAt: now,
        });
        console.log("[event-outbox] event queued", { type: "ROUTER_JOB_ROUTED", jobId, contractorId });
      }

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        createdAt: now,
        actorUserId: routerUserId,
        action: "JOB_ROUTING_APPLIED",
        entityType: "Job",
        entityId: jobId,
        metadata: { contractorIds: desired, stage: "router_stage2" } as any,
      });

      return { kind: "ok" as const, created: desired.length };
    });
  } catch (err) {
    console.error("[stage2-route-error]", {
      routerUserId,
      jobId,
      contractorIds,
      err,
    });
    throw err;
  }
}
