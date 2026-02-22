import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs } from "../../../../db/schema/job";
import { handleApiError } from "../../../../src/lib/errorHandler";
import { ok } from "../../../../src/lib/api/respond";

export async function GET() {
  try {
    const result = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        scope: jobs.scope,
        region: jobs.region,
        serviceType: jobs.service_type,
        tradeCategory: jobs.trade_category,
        timeWindow: jobs.time_window,
        routerEarningsCents: jobs.router_earnings_cents,
        brokerFeeCents: jobs.broker_fee_cents,
        contractorPayoutCents: jobs.contractor_payout_cents,
        laborTotalCents: jobs.labor_total_cents,
        materialsTotalCents: jobs.materials_total_cents,
        transactionFeeCents: jobs.transaction_fee_cents,
        publishedAt: jobs.published_at,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.archived, false),
          inArray(jobs.status, ["PUBLISHED", "OPEN_FOR_ROUTING"]),
          eq(jobs.routing_status, "UNROUTED"),
          isNull(jobs.claimed_by_user_id),
          eq(jobs.is_mock, false),
          eq(jobs.job_source, "REAL"), // Only real jobs in feed
          // Integrity guard: never emit zero-dollar jobs to the UI.
          gt(jobs.labor_total_cents, 0),
          gt(jobs.contractor_payout_cents, 0),
          gt(jobs.router_earnings_cents, 0),
          gt(jobs.broker_fee_cents, 0),
        ),
      )
      .orderBy(desc(jobs.published_at))
      .limit(50);

    return ok({ jobs: result });
  } catch (err) {
    return handleApiError(err, "GET /api/jobs/feed");
  }
}

