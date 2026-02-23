import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { requireRouterReady } from "../../../../../src/auth/requireRouterReady";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { ok } from "../../../../../src/lib/api/respond";
import { db } from "../../../../../db/drizzle";
import { jobDispatches } from "../../../../../db/schema/jobDispatch";
import { jobs } from "../../../../../db/schema/job";
import { jobPayments } from "../../../../../db/schema/jobPayment";
import { routers } from "../../../../../db/schema/router";
import { users } from "../../../../../db/schema/user";
import { normalizeCountryCode, normalizeStateCode } from "../../../../../src/jurisdiction";

export async function GET(req: Request) {
  try {
    const authed = await requireRouterReady(req);
    if (authed instanceof Response) return authed;
    const router = authed;

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
    if (!routerRow) return ok({ jobs: [] });
    const routerCountryCode = normalizeCountryCode(String((routerRow as any).countryCode ?? routerRow.homeCountry ?? ""));
    const routerStateCode = normalizeStateCode(String((routerRow as any).stateCode ?? routerRow.homeRegionCode ?? ""));
    if (!routerCountryCode || !routerStateCode) {
      // Should be unreachable: profile completeness is required by requireRouterActive().
      return ok({ jobs: [] });
    }

    // Keep the marketplace fresh: expire stale routing + recycle jobs back to OPEN automatically.
    await db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(jobDispatches)
        .set({ status: "EXPIRED", respondedAt: now, updatedAt: now })
        .where(and(eq(jobDispatches.status, "PENDING"), sql`${jobDispatches.expiresAt} <= now()`));

      const candidateJobs = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.archived, false),
            eq(jobs.is_mock, false),
            eq(jobs.status, "OPEN_FOR_ROUTING"),
            eq(jobs.routing_status, "ROUTED_BY_ROUTER"),
          ),
        );
      const candidateIds = candidateJobs.map((j) => j.id);
      if (candidateIds.length === 0) return;

      const stats = await tx
        .select({
          jobId: jobDispatches.jobId,
          activePending: sql<number>`sum(case when ${jobDispatches.status} = 'PENDING' and ${jobDispatches.expiresAt} > now() then 1 else 0 end)`,
          accepted: sql<number>`sum(case when ${jobDispatches.status} = 'ACCEPTED' then 1 else 0 end)`,
        })
        .from(jobDispatches)
        .where(inArray(jobDispatches.jobId, candidateIds as any))
        .groupBy(jobDispatches.jobId);

      const byJobId = new Map(stats.map((s) => [s.jobId, s]));
      const recycleIds = candidateIds.filter((id) => {
        const s = byJobId.get(id);
        const pending = Number((s as any)?.activePending ?? 0);
        const accepted = Number((s as any)?.accepted ?? 0);
        return pending <= 0 && accepted <= 0;
      });
      if (recycleIds.length === 0) return;

      await tx
        .update(jobs)
        .set({
          claimed_by_user_id: null,
          claimed_at: null,
          routed_at: null,
          routing_status: "UNROUTED" as any,
        })
        .where(inArray(jobs.id, recycleIds as any));
    });

    const raw = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        title: jobs.title,
        scope: jobs.scope,
        region: jobs.region,
        postedAt: jobs.posted_at,
        serviceType: jobs.service_type,
        tradeCategory: jobs.trade_category,
        jobType: jobs.job_type,
        contractorPayoutCents: jobs.contractor_payout_cents,
        routerEarningsCents: jobs.router_earnings_cents,
        brokerFeeCents: jobs.broker_fee_cents,
        laborTotalCents: jobs.labor_total_cents,
        materialsTotalCents: jobs.materials_total_cents,
        transactionFeeCents: jobs.transaction_fee_cents,
        publishedAt: jobs.published_at,
      })
      .from(jobs)
      .innerJoin(jobPayments, eq(jobPayments.jobId, jobs.id))
      .where(
        and(
          eq(jobs.archived, false),
          // Router open-jobs list (only)
          eq(jobs.status, "OPEN_FOR_ROUTING"),
          eq(jobs.routing_status, "UNROUTED"),
          isNull(jobs.claimed_by_user_id), // Prisma `routerId: null` maps to claimedByUserId
          eq(jobs.is_mock, false),
          eq(jobs.country_code, routerCountryCode as any),
          eq(jobs.state_code, routerStateCode),
          eq(jobPayments.status, "CAPTURED"),
        ),
      )
      .orderBy(desc(jobs.published_at), desc(jobs.id))
      .limit(100);

    const jobsRes = raw.map((j) => {
      const contractorPayoutCents = Number((j.contractorPayoutCents as any) ?? 0);
      const routerEarningsCents = Number((j.routerEarningsCents as any) ?? 0);
      const brokerFeeCents = Number((j.brokerFeeCents as any) ?? 0);
      const transactionFeeCents = Number((j.transactionFeeCents as any) ?? 0);

      const jobPosterPaysCents = contractorPayoutCents + routerEarningsCents + brokerFeeCents + transactionFeeCents;
      return {
        id: j.id,
        status: j.status,
        title: j.title,
        scope: j.scope,
        region: j.region,
        postedAt: j.postedAt ? j.postedAt.toISOString() : "",
        serviceType: j.serviceType,
        tradeCategory: j.tradeCategory,
        jobType: j.jobType,
        budgetCents: jobPosterPaysCents,
        laborTotalCents: j.laborTotalCents,
        materialsTotalCents: j.materialsTotalCents,
        transactionFeeCents: j.transactionFeeCents,
        contractorPayoutCents: j.contractorPayoutCents,
        routerEarningsCents: j.routerEarningsCents,
        platformFeeCents: j.brokerFeeCents,
        publishedAt: j.publishedAt ? j.publishedAt.toISOString() : "",
      };
    });

    return ok({ jobs: jobsRes });
  } catch (err) {
    return handleApiError(err, "GET /api/web/router/routable-jobs");
  }
}

