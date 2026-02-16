import crypto from "crypto";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireRouterReady } from "../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../src/http/errors";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { contractors } from "../../../../../db/schema/contractor";
import { jobDispatches } from "../../../../../db/schema/jobDispatch";
import { jobs } from "../../../../../db/schema/job";
import { routers } from "../../../../../db/schema/router";
import { users } from "../../../../../db/schema/user";
import { haversineKm, stateFromRegion } from "../../../../../src/jobs/geo";
import { serviceTypeToTradeCategory } from "../../../../../src/contractors/tradeMap";
import { ensureActiveAccount } from "../../../../../src/server/accountGuard";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

const BodySchema = z.object({
  jobId: z.string().min(1),
  contractorIds: z.array(z.string().min(1)).min(1).max(5)
});

export async function POST(req: Request) {
  try {
    const ready = await requireRouterReady(req);
    if (ready instanceof Response) return ready;
    const router = ready;
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
          status: routers.status,
        })
        .from(routers)
        .where(eq(routers.userId, router.userId))
        .limit(1);
      const routerRow = routerRows[0] ?? null;
      if (!routerRow || routerRow.status !== "ACTIVE") return { kind: "forbidden" as const };

      if (!String(routerRow.homeRegionCode ?? "").trim()) return { kind: "blocked" as const, missing: ["HOME_REGION"] };

      const jobRows = await tx
        .select({
          id: jobs.id,
          archived: jobs.archived,
          isMock: jobs.isMock,
          jobSource: jobs.jobSource,
          status: jobs.status,
          routingStatus: jobs.routingStatus,
          country: jobs.country,
          region: jobs.region,
          regionCode: jobs.regionCode,
          serviceType: jobs.serviceType,
          tradeCategory: jobs.tradeCategory,
          jobType: jobs.jobType,
          lat: jobs.lat,
          lng: jobs.lng,
          claimedByUserId: jobs.claimedByUserId,
          firstRoutedAt: jobs.firstRoutedAt,
          contractorPayoutCents: jobs.contractorPayoutCents,
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

      const jobState = stateFromRegion(job.region);
      const jobRegionCode = String((job as any).regionCode ?? jobState).trim().toUpperCase();
      if (routerRow.homeCountry !== job.country || routerRow.homeRegionCode !== jobRegionCode) {
        return { kind: "forbidden" as const };
      }

      if (typeof job.lat !== "number" || typeof job.lng !== "number") return { kind: "missing_job_coords" as const };

      const isUS = String(job.country ?? "").toUpperCase() === "US";
      const milesToKm = (mi: number) => mi * 1.60934;
      const limitKm = job.jobType === "urban" ? (isUS ? milesToKm(30) : 50) : isUS ? milesToKm(60) : 100;

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
          lat: contractors.lat,
          lng: contractors.lng,
        })
        .from(contractors)
        .innerJoin(users, sql`lower(${users.email}) = lower(${contractors.email})`)
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
        const regions = (c.regions ?? []) as string[];

        if (!tradeCategories.includes(category)) return { kind: "contractor_not_eligible" as const };
        if (String(category) === "AUTOMOTIVE" && !c.automotiveEnabled) return { kind: "contractor_not_eligible" as const };

        const contractorStateMatches = regions.some((r) => stateFromRegion(r) === jobState);
        if (!contractorStateMatches) return { kind: "contractor_not_eligible" as const };

        if (typeof c.lat !== "number" || typeof c.lng !== "number") return { kind: "contractor_missing_coords" as const };
        const km = haversineKm({ lat: job.lat, lng: job.lng }, { lat: c.lat, lng: c.lng });
        if (km > limitKm) return { kind: "contractor_not_eligible" as const };

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
          claimedByUserId: router.userId,
          claimedAt: now,
          routedAt: now,
          routingStatus: "ROUTED_BY_ROUTER" as any,
          firstRoutedAt: (job.firstRoutedAt ?? now) as any,
        })
        .where(and(eq(jobs.id, job.id), eq(jobs.routingStatus, "UNROUTED"), sql`${jobs.claimedByUserId} is null`))
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
    if (result.kind === "blocked")
      return NextResponse.json({ error: "Router not eligible", blocked: true, missing: result.missing }, { status: 403 });
    if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

