import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPayments } from "@/db/schema/jobPayment";
import { jobs } from "@/db/schema/job";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";

export async function getV4RouterAvailableJobs(userId: string) {
  const profileRows = await db
    .select({ homeCountryCode: routerProfilesV4.homeCountryCode, homeRegionCode: routerProfilesV4.homeRegionCode })
    .from(routerProfilesV4)
    .where(eq(routerProfilesV4.userId, userId))
    .limit(1);

  const profile = profileRows[0] ?? null;
  const countryCode = profile?.homeCountryCode?.trim();
  const regionCode = profile?.homeRegionCode?.trim();

  if (!countryCode || !regionCode) {
    return { jobs: [] };
  }

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
        eq(jobs.status, "OPEN_FOR_ROUTING"),
        eq(jobs.routing_status, "UNROUTED"),
        isNull(jobs.claimed_by_user_id),
        eq(jobs.is_mock, false),
        eq(jobs.country_code, countryCode as any),
        eq(jobs.state_code, regionCode),
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

  return { jobs: jobsRes };
}
