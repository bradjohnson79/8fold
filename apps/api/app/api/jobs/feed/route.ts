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
        serviceType: jobs.serviceType,
        tradeCategory: jobs.tradeCategory,
        timeWindow: jobs.timeWindow,
        routerEarningsCents: jobs.routerEarningsCents,
        brokerFeeCents: jobs.brokerFeeCents,
        contractorPayoutCents: jobs.contractorPayoutCents,
        laborTotalCents: jobs.laborTotalCents,
        materialsTotalCents: jobs.materialsTotalCents,
        transactionFeeCents: jobs.transactionFeeCents,
        publishedAt: jobs.publishedAt,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.archived, false),
          inArray(jobs.status, ["PUBLISHED", "OPEN_FOR_ROUTING"]),
          eq(jobs.routingStatus, "UNROUTED"),
          isNull(jobs.claimedByUserId),
          eq(jobs.isMock, false),
          eq(jobs.jobSource, "REAL"), // Only real jobs in feed
          // Integrity guard: never emit zero-dollar jobs to the UI.
          gt(jobs.laborTotalCents, 0),
          gt(jobs.contractorPayoutCents, 0),
          gt(jobs.routerEarningsCents, 0),
          gt(jobs.brokerFeeCents, 0),
        ),
      )
      .orderBy(desc(jobs.publishedAt))
      .limit(50);

    return ok({ jobs: result });
  } catch (err) {
    return handleApiError(err, "GET /api/jobs/feed");
  }
}

