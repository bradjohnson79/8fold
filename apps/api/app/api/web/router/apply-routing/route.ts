import crypto from "crypto";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireRouterReady } from "../../../../../src/auth/requireRouterReady";
import { toHttpError } from "../../../../../src/http/errors";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { contractorAccounts } from "../../../../../db/schema/contractorAccount";
import { contractors } from "../../../../../db/schema/contractor";
import { jobDispatches } from "../../../../../db/schema/jobDispatch";
import { jobs } from "../../../../../db/schema/job";
import { routers } from "../../../../../db/schema/router";
import { users } from "../../../../../db/schema/user";
import { haversineKm } from "../../../../../src/jobs/geo";
import { serviceTypeToTradeCategory } from "../../../../../src/contractors/tradeMap";
import { ensureActiveAccount } from "../../../../../src/server/accountGuard";
import { isSameJurisdiction, normalizeCountryCode, normalizeStateCode } from "../../../../../src/jurisdiction";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

const BodySchema = z.object({
  jobId: z.string().min(1),
  contractorIds: z.array(z.string().min(1)).min(1).max(5)
});

export async function POST(req: Request) {
  try {
    const authed = await requireRouterReady(req);
    if (authed instanceof Response) return authed;
    const router = authed;
    await ensureActiveAccount(router.userId);
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const desired = Array.from(new Set(body.data.contractorIds)).slice(0, 5);

    const result = await db.transaction(async (tx) => {
      const routerRows = await tx
        .select({
          homeCountry: routers.homeCountry,
          homeRegionCode: routers.homeRegionCode,
          countryCode: users.countryCode,
          stateCode: users.stateCode,
          status: routers.status,
        })
        .from(routers)
        .innerJoin(users, eq(users.id, routers.userId))
        .where(eq(routers.userId, router.userId))
        .limit(1);
      const routerRow = routerRows[0] ?? null;
      if (!routerRow) return { kind: "forbidden" as const };
      const routerCountryCode = normalizeCountryCode(String((routerRow as any).countryCode ?? routerRow.homeCountry ?? ""));
      const routerStateCode = normalizeStateCode(String((routerRow as any).stateCode ?? routerRow.homeRegionCode ?? ""));
      if (!routerCountryCode || !routerStateCode) return { kind: "forbidden" as const };

      const jobRows = await tx
        .select({
          id: jobs.id,
          archived: jobs.archived,
          isMock: jobs.is_mock,
          jobSource: jobs.job_source,
          status: jobs.status,
          routingStatus: jobs.routing_status,
          country: jobs.country,
          countryCode: jobs.country_code,
          region: jobs.region,
          regionCode: jobs.region_code,
          stateCode: jobs.state_code,
          serviceType: jobs.service_type,
          tradeCategory: jobs.trade_category,
          jobType: jobs.job_type,
          lat: jobs.lat,
          lng: jobs.lng,
          claimedByUserId: jobs.claimed_by_user_id,
          firstRoutedAt: jobs.first_routed_at,
          contractorPayoutCents: jobs.contractor_payout_cents,
        })
        .from(jobs)
        .where(eq(jobs.id, body.data.jobId))
        .limit(1);
      const job = jobRows[0] ?? null;
      if (!job) return { kind: "not_found" as const };
      if (job.archived) return { kind: "job_archived" as const };
      if (job.isMock || job.jobSource === "MOCK") return { kind: "job_not_available" as const };
      if (job.status !== "OPEN_FOR_ROUTING") return { kind: "job_not_available" as const };
      if (job.routingStatus !== "UNROUTED") return { kind: "job_not_available" as const };
      if (job.claimedByUserId) return { kind: "job_not_available" as const };
      if (!job.contractorPayoutCents || Number(job.contractorPayoutCents as any) <= 0) return { kind: "pricing_unlocked" as const };

      const jobCountryCode = normalizeCountryCode(String((job as any).countryCode ?? job.country ?? ""));
      const jobStateCode = normalizeStateCode(String((job as any).stateCode ?? (job as any).regionCode ?? ""));
      if (!isSameJurisdiction(routerCountryCode, routerStateCode, jobCountryCode, jobStateCode)) {
        return { kind: "cross_jurisdiction_blocked" as const };
      }

      if (typeof job.lat !== "number" || typeof job.lng !== "number") return { kind: "missing_job_coords" as const };

      const isUS = String(job.country ?? "").toUpperCase() === "US";
      const milesToKm = (mi: number) => mi * 1.60934;
      const jobTypeLimitKm = job.jobType === "urban" ? (isUS ? milesToKm(30) : 50) : isUS ? milesToKm(60) : 100;

      const existingPending = await tx
        .select({ contractorId: jobDispatches.contractorId })
        .from(jobDispatches)
        .where(and(eq(jobDispatches.jobId, job.id), eq(jobDispatches.status, "PENDING"), sql`${jobDispatches.expiresAt} > now()`));
      const existingContractorIds = new Set(existingPending.map((d) => d.contractorId));
      const newIds = desired.filter((id) => !existingContractorIds.has(id));
      if (existingPending.length + newIds.length > 5) return { kind: "too_many" as const };

      const category = (job.tradeCategory ?? serviceTypeToTradeCategory(job.serviceType)) as any;

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
        if (!c || c.status !== "APPROVED") return { kind: "contractor_not_eligible" as const };

        const tradeCategories = (c.tradeCategories ?? []) as any[];
        if (!tradeCategories.includes(category)) return { kind: "contractor_not_eligible" as const };
        if (String(category) === "AUTOMOTIVE" && !c.automotiveEnabled) return { kind: "contractor_not_eligible" as const };
        const contractorCountryCode = normalizeCountryCode(String((c as any).countryCode ?? ""));
        const contractorStateCode = normalizeStateCode(String((c as any).stateCode ?? ""));
        if (!isSameJurisdiction(contractorCountryCode, contractorStateCode, jobCountryCode, jobStateCode)) {
          return { kind: "cross_jurisdiction_blocked" as const };
        }

        if (typeof c.lat !== "number" || typeof c.lng !== "number") return { kind: "contractor_missing_coords" as const };
        const km = haversineKm({ lat: job.lat, lng: job.lng }, { lat: c.lat, lng: c.lng });
        const serviceRadiusKm = typeof c.serviceRadiusKm === "number" && c.serviceRadiusKm > 0 ? c.serviceRadiusKm : null;
        const effectiveRadiusKm = serviceRadiusKm !== null ? Math.min(jobTypeLimitKm, serviceRadiusKm) : jobTypeLimitKm;
        if (km > effectiveRadiusKm) return { kind: "contractor_not_eligible" as const };

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
          routerUserId: router.userId,
        });

        await tx.insert(auditLogs).values({
          id: randomUUID(),
          createdAt: now,
          actorUserId: router.userId,
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
          claimed_by_user_id: router.userId,
          claimed_at: now,
          routed_at: now,
          routing_status: "ROUTED_BY_ROUTER" as any,
          first_routed_at: (job.firstRoutedAt ?? now) as any,
        })
        .where(and(eq(jobs.id, job.id), eq(jobs.routing_status, "UNROUTED"), sql`${jobs.claimed_by_user_id} is null`))
        .returning({ id: jobs.id });
      if (updated.length !== 1) return { kind: "job_not_available" as const };

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        createdAt: now,
        actorUserId: router.userId,
        action: "JOB_ROUTING_APPLIED",
        entityType: "Job",
        entityId: job.id,
        metadata: { contractorIds: desired, createdDispatches: created.map((c) => c.dispatchId) } as any,
      });

      return { kind: "ok" as const, created };
    });

    if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (result.kind === "cross_jurisdiction_blocked")
      return NextResponse.json(
        { error: "8Fold restricts work to within your registered state/province.", code: "CROSS_JURISDICTION_BLOCKED" },
        { status: 403 },
      );
    if (result.kind === "job_archived") return NextResponse.json({ error: "Archived jobs cannot be routed" }, { status: 409 });
    if (result.kind === "job_not_available") return NextResponse.json({ error: "Job not available" }, { status: 409 });
    if (result.kind === "pricing_unlocked") return NextResponse.json({ error: "Job pricing is not locked" }, { status: 409 });
    if (result.kind === "missing_job_coords")
      return NextResponse.json({ error: "Job location coordinates are missing" }, { status: 409 });
    if (result.kind === "too_many") return NextResponse.json({ error: "Max 5 contractors per job" }, { status: 409 });
    if (result.kind === "contractor_missing_coords")
      return NextResponse.json({ error: "Contractor location coordinates are missing" }, { status: 409 });
    if (result.kind === "contractor_not_eligible")
      return NextResponse.json({ error: "Contractor not eligible" }, { status: 409 });

    return NextResponse.json({ ok: true, created: result.created });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

