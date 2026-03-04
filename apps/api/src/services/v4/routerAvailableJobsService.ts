import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";
import { expireStaleInvitesAndResetJobs } from "@/src/services/v4/inviteExpirationService";

function normalizeRegionCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeCountryCode(value: string | null | undefined): "US" | "CA" {
  const c = String(value ?? "").trim().toUpperCase();
  return c === "CA" ? "CA" : "US";
}

export async function getV4RouterAvailableJobs(userId: string) {
  try {
    await expireStaleInvitesAndResetJobs();

    const profileRows = await db
      .select({
        countryCode: routerProfilesV4.homeCountryCode,
        regionCode: routerProfilesV4.homeRegionCode,
      })
      .from(routerProfilesV4)
      .where(eq(routerProfilesV4.userId, userId))
      .limit(1);

    const profile = profileRows[0] ?? null;
    const routerCountry = normalizeCountryCode(profile?.countryCode);
    const routerRegionCode = normalizeRegionCode(profile?.regionCode);

    if (!routerRegionCode || !/^[A-Z]{2}$/.test(routerRegionCode)) {
      return { ok: true as const, jobs: [] };
    }

    if (process.env.NODE_ENV !== "production") {
      console.debug(`[router-available-jobs] Router: ${routerCountry} / ${routerRegionCode}`);
    }

    const raw = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        title: jobs.title,
        scope: jobs.scope,
        city: jobs.city,
        region: jobs.region,
        countryCode: jobs.country_code,
        regionCode: jobs.region_code,
        stateCode: jobs.state_code,
        postedAt: jobs.posted_at,
        serviceType: jobs.service_type,
        tradeCategory: jobs.trade_category,
        jobType: jobs.job_type,
        amountCents: jobs.amount_cents,
        totalAmountCents: jobs.total_amount_cents,
        contractorPayoutCents: jobs.contractor_payout_cents,
        routerEarningsCents: jobs.router_earnings_cents,
        brokerFeeCents: jobs.broker_fee_cents,
        laborTotalCents: jobs.labor_total_cents,
        materialsTotalCents: jobs.materials_total_cents,
        transactionFeeCents: jobs.transaction_fee_cents,
        publishedAt: jobs.published_at,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.status, "OPEN_FOR_ROUTING"),
          eq(jobs.cancel_request_pending, false),
          isNull(jobs.archived_at),
          isNull(jobs.contractor_user_id),
          eq(jobs.country_code, routerCountry),
          sql`upper(trim(coalesce(${jobs.region_code}, ${jobs.state_code}, ''))) = ${routerRegionCode}`,
        ),
      )
      .orderBy(desc(jobs.published_at), desc(jobs.id))
      .limit(50);

    if (process.env.NODE_ENV !== "production") {
      console.debug(`[router-available-jobs] Jobs Returned: ${raw.length}`);
    }

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
        city: j.city,
        region: j.region,
        countryCode: j.countryCode,
        regionCode: normalizeRegionCode(j.regionCode ?? j.stateCode),
        provinceCode: normalizeRegionCode(j.regionCode ?? j.stateCode),
        postedAt: j.postedAt ? j.postedAt.toISOString() : "",
        createdAt: j.postedAt ? j.postedAt.toISOString() : "",
        serviceType: j.serviceType,
        tradeCategory: j.tradeCategory,
        jobType: j.jobType,
        urbanOrRegional: j.jobType === "urban" ? "Urban" : "Regional",
        budgetCents: jobPosterPaysCents,
        appraisalTotal:
          Number((j.totalAmountCents as any) ?? 0) > 0
            ? Number((j.totalAmountCents as any) ?? 0)
            : Number((j.amountCents as any) ?? 0) > 0
              ? Number((j.amountCents as any) ?? 0)
              : jobPosterPaysCents,
        laborTotalCents: j.laborTotalCents,
        materialsTotalCents: j.materialsTotalCents,
        transactionFeeCents: j.transactionFeeCents,
        contractorPayoutCents: j.contractorPayoutCents,
        routerEarningsCents: j.routerEarningsCents,
        platformFeeCents: j.brokerFeeCents,
        publishedAt: j.publishedAt ? j.publishedAt.toISOString() : "",
      };
    });

    return { ok: true as const, jobs: jobsRes };
  } catch {
    return { ok: true as const, jobs: [] };
  }
}
