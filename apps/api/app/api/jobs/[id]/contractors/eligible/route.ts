import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { contractors } from "../../../../../../db/schema/contractor";
import { jobAssignments } from "../../../../../../db/schema/jobAssignment";
import { jobs } from "../../../../../../db/schema/job";
import { routers } from "../../../../../../db/schema/router";
import { users } from "../../../../../../db/schema/user";
import { requireRouterReady } from "../../../../../../src/auth/requireRouterReady";
import { toHttpError } from "../../../../../../src/http/errors";
import { haversineKm } from "../../../../../../src/jobs/geo";
import { geocodeCityCentroid, regionToCityState } from "../../../../../../src/jobs/geocode";
import { serviceTypeToTradeCategory } from "../../../../../../src/contractors/tradeMap";
import { isSameJurisdiction, normalizeCountryCode, normalizeStateCode } from "../../../../../../src/jurisdiction";

function getJobIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/contractors/eligible
  return parts[parts.length - 3] ?? "";
}

function normalizeCategory(s: string) {
  return s.trim().toLowerCase();
}

export async function GET(req: Request) {
  try {
    const authed = await requireRouterReady(req);
    if (authed instanceof Response) return authed;
    const router = authed;
    const jobId = getJobIdFromUrl(req);

    const routerRows = await db
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
    if (!routerRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const routerCountryCode = normalizeCountryCode(String((routerRow as any).countryCode ?? routerRow.homeCountry ?? ""));
    const routerStateCode = normalizeStateCode(String((routerRow as any).stateCode ?? routerRow.homeRegionCode ?? ""));
    if (!routerCountryCode || !routerStateCode) {
      // Should be unreachable: profile completeness is required by requireRouterActive().
      return NextResponse.json({ error: "Router home region required" }, { status: 409 });
    }

    const jobRows = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        region: jobs.region,
        regionCode: jobs.regionCode,
        country: jobs.country,
        countryCode: jobs.countryCode,
        stateCode: jobs.stateCode,
        routingStatus: jobs.routingStatus,
        serviceType: jobs.serviceType,
        tradeCategory: jobs.tradeCategory,
        jobType: jobs.jobType,
        lat: jobs.lat,
        lng: jobs.lng,
        contractorPayoutCents: jobs.contractorPayoutCents,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    const job = jobRows[0] ?? null;
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Preconditions
    if (job.status !== "OPEN_FOR_ROUTING") return NextResponse.json({ error: "Job not available" }, { status: 409 });
    if (job.routingStatus !== "UNROUTED") return NextResponse.json({ error: "Job not available" }, { status: 409 });
    if (!job.contractorPayoutCents || job.contractorPayoutCents <= 0)
      return NextResponse.json({ error: "Job pricing is not locked" }, { status: 409 });

    const jobCountryCode = normalizeCountryCode(String((job as any).countryCode ?? (job as any).country ?? ""));
    const jobStateCode = normalizeStateCode(String((job as any).stateCode ?? (job as any).regionCode ?? ""));
    if (!isSameJurisdiction(routerCountryCode, routerStateCode, jobCountryCode, jobStateCode)) {
      return NextResponse.json(
        { error: "8Fold restricts work to within your registered state/province.", code: "CROSS_JURISDICTION_BLOCKED" },
        { status: 403 },
      );
    }

    // Ensure job coords exist (centroid fallback)
    let jobLat = typeof job.lat === "number" ? job.lat : null;
    let jobLng = typeof job.lng === "number" ? job.lng : null;
    if (jobLat === null || jobLng === null) {
      const cs = regionToCityState(job.region);
      if (!cs) return NextResponse.json({ error: "Unable to resolve job location coordinates." }, { status: 409 });
      const resolved = await geocodeCityCentroid({ city: cs.city, state: cs.state });
      if (!resolved) return NextResponse.json({ error: "Unable to resolve job location coordinates." }, { status: 409 });
      await db.update(jobs).set({ lat: resolved.lat, lng: resolved.lng }).where(eq(jobs.id, job.id));
      jobLat = resolved.lat;
      jobLng = resolved.lng;
    }

    const category = (job.tradeCategory ?? serviceTypeToTradeCategory(job.serviceType)) as any;
    const candidateRows = await db
      .select({
        id: contractors.id,
        businessName: contractors.businessName,
        contactName: contractors.contactName,
        yearsExperience: contractors.yearsExperience,
        tradeCategories: contractors.tradeCategories,
        regions: contractors.regions,
        countryCode: users.countryCode,
        stateCode: users.stateCode,
        lat: contractors.lat,
        lng: contractors.lng,
      })
      .from(contractors)
      .innerJoin(users, sql`lower(${users.email}) = lower(${contractors.email})`)
      .where(
        and(
          eq(users.status, "ACTIVE"),
          eq(contractors.status, "APPROVED"),
          // Prisma `tradeCategories: { has: category }` (enum[]). Cast to text[] for safe containment check.
          sql<boolean>`${contractors.tradeCategories}::text[] @> ARRAY[${String(category)}]::text[]`,
          category === "AUTOMOTIVE" ? eq(contractors.automotiveEnabled, true) : sql<boolean>`true`,
        ),
      );

    const candidateIds = candidateRows.map((c) => c.id);

    const completedAssignmentsByContractorId = new Map<string, { completedAt: Date | null }[]>();
    if (candidateIds.length > 0) {
      const completed = await db
        .select({
          contractorId: jobAssignments.contractorId,
          completedAt: jobAssignments.completedAt,
        })
        .from(jobAssignments)
        .where(
          and(
            inArray(jobAssignments.contractorId, candidateIds),
            eq(jobAssignments.status, "COMPLETED"),
          ),
        );
      for (const a of completed) {
        const arr = completedAssignmentsByContractorId.get(a.contractorId) ?? [];
        arr.push({ completedAt: a.completedAt ?? null });
        completedAssignmentsByContractorId.set(a.contractorId, arr);
      }
    }

    const candidates = candidateRows.map((c) => ({
      ...c,
      tradeCategories: (c.tradeCategories ?? []) as any[],
      regions: (c.regions ?? []) as string[],
      jobAssignments: completedAssignmentsByContractorId.get(c.id) ?? [],
    }));

    const isUS = String((job as any).country ?? "").toUpperCase() === "US";
    const milesToKm = (mi: number) => mi * 1.60934;
    const limitKm = job.jobType === "urban" ? (isUS ? milesToKm(30) : 50) : isUS ? milesToKm(60) : 100;

    const eligibleBase = candidates
      .map((c) => {
        const matchesCategory = (c.tradeCategories as any[]).includes(category);
        const contractorCountryCode = normalizeCountryCode(String((c as any).countryCode ?? ""));
        const contractorStateCode = normalizeStateCode(String((c as any).stateCode ?? ""));
        const contractorJurisdictionMatches = isSameJurisdiction(
          contractorCountryCode,
          contractorStateCode,
          jobCountryCode,
          jobStateCode,
        );
        const hasCoords = typeof c.lat === "number" && typeof c.lng === "number";
        const km = contractorJurisdictionMatches && hasCoords ? haversineKm({ lat: jobLat!, lng: jobLng! }, { lat: c.lat!, lng: c.lng! }) : null;
        const within = km !== null ? km <= limitKm : false;
        const completedCount = c.jobAssignments.length;
        const lastCompletedAtMs = c.jobAssignments.reduce(
          (acc: number | null, a: { completedAt: Date | null }) => {
            if (!a.completedAt) return acc;
            const t = a.completedAt.getTime();
            return acc == null ? t : Math.max(acc, t);
          },
          null,
        );
        const reliability: "GOOD" | "WATCH" | "NEW" =
          completedCount >= 5 ? "GOOD" : completedCount === 0 ? "NEW" : "WATCH";
        return {
          id: c.id,
          businessName: c.businessName,
          name: c.contactName ?? c.businessName,
          yearsExperience: c.yearsExperience,
          trade: category,
          distanceKm: km,
          reliability,
          jobsCompletedCount: completedCount,
          fixedPayoutCents: job.contractorPayoutCents,
          _eligible: matchesCategory && contractorJurisdictionMatches && within,
          _lastCompletedAtMs: lastCompletedAtMs
        };
      })
      .filter((x) => x._eligible);

    const ids = eligibleBase.map((x) => x.id);

    // Availability definition (server-side, not editable by contractors):
    // AVAILABLE: contractor has no jobs in APPOINTMENT_PROPOSED or IN_PROGRESS
    // BUSY: contractor has one or more jobs in those states
    const busyInProgress = new Set<string>();
    if (ids.length > 0) {
      const inProgress = await db
        .select({ contractorId: jobAssignments.contractorId })
        .from(jobAssignments)
        .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
        .where(and(inArray(jobAssignments.contractorId, ids), eq(jobs.status, "IN_PROGRESS")));
      for (const a of inProgress) busyInProgress.add(a.contractorId);
    }

    const busyAppointmentProposed = new Set<string>();
    if (ids.length > 0) {
      const assigned = await db
        .select({ contractorId: jobAssignments.contractorId, jobId: jobAssignments.jobId })
        .from(jobAssignments)
        .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
        .where(and(inArray(jobAssignments.contractorId, ids), eq(jobs.status, "ASSIGNED")));
      const jobIds = Array.from(new Set(assigned.map((a) => a.jobId)));
      if (jobIds.length > 0) {
        const logs = await db
          .select({ entityId: auditLogs.entityId, metadata: auditLogs.metadata })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.action, "APPOINTMENT_PROPOSED"),
              eq(auditLogs.entityType, "Job"),
              inArray(auditLogs.entityId, jobIds),
            ),
          )
          .orderBy(desc(auditLogs.createdAt));
        const latestByJobId = new Map<string, any>();
        for (const l of logs) {
          if (!latestByJobId.has(l.entityId)) latestByJobId.set(l.entityId, l.metadata as any);
        }
        for (const a of assigned) {
          const meta = latestByJobId.get(a.jobId);
          if (meta?.contractorId && String(meta.contractorId) === a.contractorId) {
            busyAppointmentProposed.add(a.contractorId);
          }
        }
      }
    }

    const eligible = eligibleBase
      .map(({ _eligible, _lastCompletedAtMs, ...rest }) => {
        const busy = busyInProgress.has(rest.id) || busyAppointmentProposed.has(rest.id);
        return {
          ...rest,
          availability: busy ? ("BUSY" as const) : ("AVAILABLE" as const),
          _lastCompletedAtMs: _lastCompletedAtMs ?? 0
        };
      })
      .sort((a, b) => {
        const av = a.availability === "AVAILABLE" ? 0 : 1;
        const bv = b.availability === "AVAILABLE" ? 0 : 1;
        if (av !== bv) return av - bv;
        // Longest idle time first => oldest last completion first.
        if (a._lastCompletedAtMs !== b._lastCompletedAtMs) return a._lastCompletedAtMs - b._lastCompletedAtMs;
        return (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9);
      })
      .map(({ _lastCompletedAtMs, ...rest }) => rest);

    return NextResponse.json({ contractors: eligible, limitKm });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

