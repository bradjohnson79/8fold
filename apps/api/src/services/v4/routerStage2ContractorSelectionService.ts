import { randomUUID } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { jobs } from "@/db/schema/job";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";
import { haversineKm } from "@/src/jobs/geo";

export type Stage2ContractorCard = {
  contractorId: string;
  businessName: string;
  contactName: string;
  tradeCategory: string;
  yearsExperience: number;
  city: string;
  distanceKm: number;
};

type Stage2JobSnapshot = {
  id: string;
  title: string;
  city: string;
  region: string;
  provinceCode: string;
  tradeCategory: string;
  jobType: "urban" | "regional";
  status: string;
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
  | { kind: "contractor_not_eligible" };

function normalizeProvinceCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
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

function resolveMaxDistanceKm(jobType: string): number {
  return String(jobType).toLowerCase() === "urban" ? 50 : 100;
}

async function fetchJobSnapshot(jobId: string): Promise<Stage2JobSnapshot | null> {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      city: jobs.city,
      region: jobs.region,
      provinceCode: jobs.state_code,
      tradeCategory: jobs.trade_category,
      jobType: jobs.job_type,
      status: jobs.status,
      lat: jobs.lat,
      lng: jobs.lng,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) return null;

  if (typeof row.lat !== "number" || !Number.isFinite(row.lat) || typeof row.lng !== "number" || !Number.isFinite(row.lng)) {
    return {
      id: row.id,
      title: row.title,
      city: row.city ?? "",
      region: row.region ?? "",
      provinceCode: normalizeProvinceCode(row.provinceCode),
      tradeCategory: normalizeTradeCategory(row.tradeCategory),
      jobType: row.jobType,
      status: row.status,
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
    tradeCategory: normalizeTradeCategory(row.tradeCategory),
    jobType: row.jobType,
    status: row.status,
    lat: row.lat,
    lng: row.lng,
  };
}

async function computeEligibleContractors(job: Stage2JobSnapshot): Promise<Stage2ContractorCard[]> {
  const maxDistanceKm = resolveMaxDistanceKm(job.jobType);

  const rows = await db
    .select({
      contractorId: contractorProfilesV4.userId,
      businessName: contractorProfilesV4.businessName,
      contactName: contractorProfilesV4.contactName,
      yearsExperience: contractorProfilesV4.yearsExperience,
      city: contractorProfilesV4.city,
      tradeCategories: contractorProfilesV4.tradeCategories,
      homeLatitude: contractorProfilesV4.homeLatitude,
      homeLongitude: contractorProfilesV4.homeLongitude,
    })
    .from(contractorProfilesV4)
    .innerJoin(contractorAccounts, eq(contractorAccounts.userId, contractorProfilesV4.userId))
    .where(sql`upper(trim(coalesce(${contractorAccounts.regionCode}, ''))) = ${job.provinceCode}`);

  const out: Stage2ContractorCard[] = [];
  for (const row of rows) {
    const categories = parseTradeCategories(row.tradeCategories);
    if (!categories.includes(job.tradeCategory)) continue;

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
      yearsExperience: Number(row.yearsExperience ?? 0),
      city: String(row.city ?? "").trim(),
      distanceKm,
    });
  }

  out.sort((a, b) => a.distanceKm - b.distanceKm || a.businessName.localeCompare(b.businessName));
  return out;
}

export async function getStage2JobContractors(jobId: string): Promise<Stage2GetContractorsResult> {
  const job = await fetchJobSnapshot(jobId);
  if (!job) return { kind: "not_found" };
  if (job.status !== "OPEN_FOR_ROUTING") return { kind: "job_not_available" };
  if (!Number.isFinite(job.lat) || !Number.isFinite(job.lng)) return { kind: "missing_job_coords" };

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
      maxDistanceKm: resolveMaxDistanceKm(job.jobType),
    },
    contractors,
  };
}

export async function routeStage2JobToContractors(
  routerUserId: string,
  jobId: string,
  contractorIds: string[],
): Promise<Stage2RouteResult> {
  const desired = Array.from(new Set(contractorIds)).filter(Boolean);
  if (desired.length < 1 || desired.length > 5) return { kind: "too_many" };

  const eligible = await getStage2JobContractors(jobId);
  if (eligible.kind === "not_found") return { kind: "not_found" };
  if (eligible.kind === "job_not_available") return { kind: "job_not_available" };
  if (eligible.kind === "missing_job_coords") return { kind: "missing_job_coords" };

  const eligibleIds = new Set(eligible.contractors.map((c) => c.contractorId));
  if (desired.some((contractorId) => !eligibleIds.has(contractorId))) {
    return { kind: "contractor_not_eligible" };
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from jobs where id = ${jobId} for update`);

    const existingRows = await tx
      .select({ contractorUserId: v4ContractorJobInvites.contractorUserId })
      .from(v4ContractorJobInvites)
      .where(and(eq(v4ContractorJobInvites.jobId, jobId), inArray(v4ContractorJobInvites.contractorUserId, desired as any)));
    if (existingRows.length > 0) return { kind: "contractor_not_eligible" as const };

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const updated = await tx
      .update(jobs)
      .set({
        claimed_by_user_id: routerUserId,
        claimed_at: now,
        routed_at: now,
        routing_status: "ROUTED_BY_ROUTER" as any,
      })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.status, "OPEN_FOR_ROUTING"),
          eq(jobs.routing_status, "UNROUTED"),
          sql`${jobs.claimed_by_user_id} is null`,
        ),
      )
      .returning({ id: jobs.id });
    if (updated.length !== 1) return { kind: "job_not_available" as const };
    for (const contractorId of desired) {
      await tx.insert(v4ContractorJobInvites).values({
        id: randomUUID(),
        routeId: routerUserId,
        jobId,
        contractorUserId: contractorId,
        status: "PENDING",
        createdAt: now,
        expiresAt,
      });
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
}
