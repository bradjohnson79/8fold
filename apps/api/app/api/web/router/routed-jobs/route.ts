import { and, eq, inArray, sql } from "drizzle-orm";
import { requireRouterReady } from "../../../../../src/auth/requireRouterReady";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { ok } from "../../../../../src/lib/api/respond";
import { db } from "../../../../../db/drizzle";
import { jobDispatches } from "../../../../../db/schema/jobDispatch";
import { jobs } from "../../../../../db/schema/job";
import { routers } from "../../../../../db/schema/router";

export async function GET(req: Request) {
  try {
    const authed = await requireRouterReady(req);
    if (authed instanceof Response) return authed;
    const router = authed;

    const routerRows = await db
      .select({
        homeRegionCode: routers.homeRegionCode,
        status: routers.status,
      })
      .from(routers)
      .where(eq(routers.userId, router.userId))
      .limit(1);
    const routerRow = routerRows[0] ?? null;
    if (!routerRow) return ok({ jobs: [] });
    if (!String(routerRow.homeRegionCode ?? "").trim()) {
      // Should be unreachable: profile completeness is required by requireRouterActive().
      return ok({ jobs: [] });
    }

    const now = new Date();

    const payload = await db.transaction(async (tx) => {
      // 1) Expire stale pending dispatches.
      await tx
        .update(jobDispatches)
        .set({ status: "EXPIRED", respondedAt: now, updatedAt: now })
        .where(and(eq(jobDispatches.status, "PENDING"), sql`${jobDispatches.expiresAt} <= now()`));

      // 2) Recycle jobs back to OPEN when routing expires (no acceptance).
      const activeJobRows = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.archived, false),
            eq(jobs.is_mock, false),
            eq(jobs.claimed_by_user_id, router.userId),
            eq(jobs.status, "OPEN_FOR_ROUTING"),
            eq(jobs.routing_status, "ROUTED_BY_ROUTER"),
          ),
        );
      const activeJobIds = activeJobRows.map((r) => r.id);

      if (activeJobIds.length) {
        const stats = await tx
          .select({
            jobId: jobDispatches.jobId,
            activePending: sql<number>`sum(case when ${jobDispatches.status} = 'PENDING' and ${jobDispatches.expiresAt} > now() then 1 else 0 end)`,
            accepted: sql<number>`sum(case when ${jobDispatches.status} = 'ACCEPTED' then 1 else 0 end)`,
          })
          .from(jobDispatches)
          .where(inArray(jobDispatches.jobId, activeJobIds as any))
          .groupBy(jobDispatches.jobId);

        const byJobId = new Map(stats.map((s) => [s.jobId, s]));
        const recycleIds = activeJobIds.filter((id) => {
          const s = byJobId.get(id);
          const pending = Number((s as any)?.activePending ?? 0);
          const accepted = Number((s as any)?.accepted ?? 0);
          return pending <= 0 && accepted <= 0;
        });

        if (recycleIds.length) {
          await tx
            .update(jobs)
            .set({
              claimed_by_user_id: null,
              claimed_at: null,
              routed_at: null,
              routing_status: "UNROUTED" as any,
            })
            .where(inArray(jobs.id, recycleIds as any));
        }
      }

      // 3) Build queue payload.
      const pendingRows = await tx
        .select({
          jobId: jobDispatches.jobId,
          expiresAt: sql<Date>`max(${jobDispatches.expiresAt})`,
          contractorCount: sql<number>`count(distinct ${jobDispatches.contractorId})`,
        })
        .from(jobDispatches)
        .where(
          and(
            eq(jobDispatches.routerUserId, router.userId),
            eq(jobDispatches.status, "PENDING"),
            sql`${jobDispatches.expiresAt} > now()`,
          ),
        )
        .groupBy(jobDispatches.jobId);

      const pendingJobIds = pendingRows.map((r) => r.jobId);
      const pendingJobs =
        pendingJobIds.length === 0
          ? []
          : await tx
              .select({ id: jobs.id, title: jobs.title, region: jobs.region, tradeCategory: jobs.trade_category })
              .from(jobs)
              .where(inArray(jobs.id, pendingJobIds as any));
      const pendingJobMap = new Map(pendingJobs.map((j) => [j.id, j]));
      const pendingPayload = pendingRows
        .map((r) => {
          const j = pendingJobMap.get(r.jobId);
          if (!j) return null;
          const expiresAtRaw = (r as any).expiresAt ?? null;
          const expiresAt =
            expiresAtRaw instanceof Date ? expiresAtRaw : expiresAtRaw ? new Date(expiresAtRaw as any) : null;
          const remainingSeconds =
            expiresAt instanceof Date ? Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)) : 0;
          return {
            id: j.id,
            title: j.title,
            region: j.region,
            tradeCategory: j.tradeCategory,
            routedContractorCount: Number((r as any).contractorCount ?? 0),
            expiresAt: expiresAt ? expiresAt.toISOString() : null,
            timeRemainingSeconds: remainingSeconds,
            status: "AWAITING_CONTRACTOR_RESPONSE" as const,
          };
        })
        .filter(Boolean);

      const expiredSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const expiredRows = await tx
        .select({
          jobId: jobDispatches.jobId,
          expiresAt: sql<Date>`max(${jobDispatches.expiresAt})`,
          contractorCount: sql<number>`count(distinct ${jobDispatches.contractorId})`,
        })
        .from(jobDispatches)
        .where(
          and(
            eq(jobDispatches.routerUserId, router.userId),
            eq(jobDispatches.status, "EXPIRED"),
            sql`${jobDispatches.respondedAt} >= ${expiredSince}`,
          ),
        )
        .groupBy(jobDispatches.jobId);

      const expiredJobIds = expiredRows.map((r) => r.jobId);
      const expiredJobs =
        expiredJobIds.length === 0
          ? []
          : await tx
              .select({ id: jobs.id, title: jobs.title, region: jobs.region, tradeCategory: jobs.trade_category })
              .from(jobs)
              .where(inArray(jobs.id, expiredJobIds as any));
      const expiredJobMap = new Map(expiredJobs.map((j) => [j.id, j]));
      const expiredPayload = expiredRows
        .map((r) => {
          const j = expiredJobMap.get(r.jobId);
          if (!j) return null;
          const expiresAtRaw = (r as any).expiresAt ?? null;
          const expiresAt =
            expiresAtRaw instanceof Date ? expiresAtRaw : expiresAtRaw ? new Date(expiresAtRaw as any) : null;
          return {
            id: j.id,
            title: j.title,
            region: j.region,
            tradeCategory: j.tradeCategory,
            routedContractorCount: Number((r as any).contractorCount ?? 0),
            expiresAt: expiresAt ? expiresAt.toISOString() : null,
            timeRemainingSeconds: 0,
            status: "EXPIRED" as const,
          };
        })
        .filter(Boolean);

      return { jobs: [...pendingPayload, ...expiredPayload] };
    });

    return ok(payload);
  } catch (err) {
    return handleApiError(err, "GET /api/web/router/routed-jobs");
  }
}

