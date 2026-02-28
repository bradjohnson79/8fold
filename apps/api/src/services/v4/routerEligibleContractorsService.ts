import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { jobs } from "@/db/schema/job";
import { payoutMethods } from "@/db/schema/payoutMethod";
import { routerProfilesV4 } from "@/db/schema/routerProfileV4";
import { users } from "@/db/schema/user";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";
import { haversineKm } from "@/src/jobs/geo";
import { isSameJurisdiction, normalizeCountryCode, normalizeStateCode } from "@/src/jurisdiction";

type EligibleContractor = {
  contractorId: string;
  businessName: string;
  contactName: string;
  tradeCategory: string;
  yearsExperience: number;
  city: string;
  stripeVerified: boolean;
  distanceKm: number;
};

export type EligibleContractorsResult =
  | {
      kind: "ok";
      job: {
        id: string;
        title: string;
        city: string;
        region: string;
        tradeCategory: string;
        urbanOrRegional: "Urban" | "Regional";
        appraisalTotal: number;
        createdAt: string;
        radiusKm: number;
      };
      contractors: EligibleContractor[];
    }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "job_not_available" }
  | { kind: "cross_jurisdiction_blocked" }
  | { kind: "missing_job_coords" };

function toTruthy(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  const value = String(raw ?? "").trim().toLowerCase();
  return ["1", "true", "t", "yes", "on"].includes(value);
}

function parseTradeCategories(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v ?? "").trim().toUpperCase()).filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v ?? "").trim().toUpperCase()).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

export async function getV4EligibleContractors(routerUserId: string, jobId: string): Promise<EligibleContractorsResult> {
  const profileRows = await db
    .select({
      homeCountryCode: routerProfilesV4.homeCountryCode,
      homeRegionCode: routerProfilesV4.homeRegionCode,
    })
    .from(routerProfilesV4)
    .where(eq(routerProfilesV4.userId, routerUserId))
    .limit(1);
  const profile = profileRows[0] ?? null;
  const routerCountryCode = normalizeCountryCode(String(profile?.homeCountryCode ?? ""));
  const routerStateCode = normalizeStateCode(String(profile?.homeRegionCode ?? ""));
  if (!routerCountryCode || !routerStateCode) return { kind: "forbidden" };

  const jobRows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      city: jobs.city,
      region: jobs.region,
      archived: jobs.archived,
      isMock: jobs.is_mock,
      status: jobs.status,
      routingStatus: jobs.routing_status,
      claimedByUserId: jobs.claimed_by_user_id,
      country: jobs.country,
      countryCode: jobs.country_code,
      stateCode: jobs.state_code,
      tradeCategory: jobs.trade_category,
      jobType: jobs.job_type,
      lat: jobs.lat,
      lng: jobs.lng,
      createdAt: jobs.created_at,
      amountCents: jobs.amount_cents,
      totalAmountCents: jobs.total_amount_cents,
      contractorPayoutCents: jobs.contractor_payout_cents,
      routerEarningsCents: jobs.router_earnings_cents,
      brokerFeeCents: jobs.broker_fee_cents,
      transactionFeeCents: jobs.transaction_fee_cents,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  const job = jobRows[0] ?? null;
  if (!job) return { kind: "not_found" };

  if (
    job.archived ||
    job.isMock ||
    job.status !== "OPEN_FOR_ROUTING" ||
    job.routingStatus !== "UNROUTED" ||
    job.claimedByUserId
  ) {
    return { kind: "job_not_available" };
  }

  const jobCountryCode = normalizeCountryCode(String(job.countryCode ?? job.country ?? ""));
  const jobStateCode = normalizeStateCode(String(job.stateCode ?? ""));
  if (!isSameJurisdiction(routerCountryCode, routerStateCode, jobCountryCode, jobStateCode)) {
    return { kind: "cross_jurisdiction_blocked" };
  }

  if (typeof job.lat !== "number" || !Number.isFinite(job.lat) || typeof job.lng !== "number" || !Number.isFinite(job.lng)) {
    return { kind: "missing_job_coords" };
  }

  const radiusKm = job.jobType === "urban" ? 50 : 100;
  const invitedRows = await db
    .select({ contractorUserId: v4ContractorJobInvites.contractorUserId })
    .from(v4ContractorJobInvites)
    .where(eq(v4ContractorJobInvites.jobId, job.id));
  const invitedUserIds = new Set(invitedRows.map((r) => r.contractorUserId));

  const candidateRows = await db
    .select({
      userId: contractorProfilesV4.userId,
      businessName: contractorProfilesV4.businessName,
      contactName: contractorProfilesV4.contactName,
      yearsExperience: contractorProfilesV4.yearsExperience,
      city: contractorProfilesV4.city,
      tradeCategories: contractorProfilesV4.tradeCategories,
      homeLatitude: contractorProfilesV4.homeLatitude,
      homeLongitude: contractorProfilesV4.homeLongitude,
      profileCountryCode: contractorProfilesV4.countryCode,
      isActive: contractorAccounts.isActive,
      wizardCompleted: contractorAccounts.wizardCompleted,
      waiverAccepted: contractorAccounts.waiverAccepted,
      stripeAccountId: contractorAccounts.stripeAccountId,
      payoutStatus: contractorAccounts.payoutStatus,
      regionCode: contractorAccounts.regionCode,
      accountCountry: contractorAccounts.country,
      userCountry: users.country,
      userStateCode: users.stateCode,
      userStatus: users.status,
    })
    .from(contractorProfilesV4)
    .innerJoin(contractorAccounts, eq(contractorAccounts.userId, contractorProfilesV4.userId))
    .innerJoin(users, eq(users.id, contractorProfilesV4.userId))
    .where(eq(users.status, "ACTIVE"));

  const candidateUserIds = candidateRows.map((r) => r.userId);
  const payoutRows =
    candidateUserIds.length > 0
      ? await db
          .select({
            userId: payoutMethods.userId,
            details: payoutMethods.details,
          })
          .from(payoutMethods)
          .where(
            and(
              inArray(payoutMethods.userId, candidateUserIds as any),
              eq(payoutMethods.provider, "STRIPE" as any),
              eq(payoutMethods.isActive, true),
            ),
          )
          .orderBy(desc(payoutMethods.createdAt))
      : [];

  const payoutByUserId = new Map<
    string,
    {
      stripeAccountId: string | null;
      stripePayoutsEnabled: boolean;
    }
  >();
  for (const row of payoutRows) {
    if (payoutByUserId.has(row.userId)) continue;
    const details = (row.details as Record<string, unknown> | null) ?? null;
    payoutByUserId.set(row.userId, {
      stripeAccountId: String(details?.stripeAccountId ?? "").trim() || null,
      stripePayoutsEnabled: toTruthy(details?.stripePayoutsEnabled) || toTruthy(details?.stripeSimulatedApproved),
    });
  }

  const jobTradeCategory = String(job.tradeCategory ?? "").trim().toUpperCase();

  const contractors: EligibleContractor[] = [];
  for (const candidate of candidateRows) {
    if (invitedUserIds.has(candidate.userId)) continue;
    if (candidate.userStatus !== "ACTIVE") continue;
    if (candidate.isActive !== true || candidate.wizardCompleted !== true || candidate.waiverAccepted !== true) continue;

    const categories = parseTradeCategories(candidate.tradeCategories);
    if (!categories.includes(jobTradeCategory)) continue;

    const contractorCountryCode = normalizeCountryCode(
      String(candidate.accountCountry ?? candidate.profileCountryCode ?? candidate.userCountry ?? ""),
    );
    const contractorStateCode = normalizeStateCode(String(candidate.regionCode ?? candidate.userStateCode ?? ""));
    if (!isSameJurisdiction(contractorCountryCode, contractorStateCode, jobCountryCode, jobStateCode)) continue;

    if (
      typeof candidate.homeLatitude !== "number" ||
      !Number.isFinite(candidate.homeLatitude) ||
      typeof candidate.homeLongitude !== "number" ||
      !Number.isFinite(candidate.homeLongitude)
    ) {
      continue;
    }

    const payoutSnapshot = payoutByUserId.get(candidate.userId);
    const stripeAccountId =
      String(candidate.stripeAccountId ?? "").trim() || String(payoutSnapshot?.stripeAccountId ?? "").trim();
    const payoutStatus = String(candidate.payoutStatus ?? "")
      .trim()
      .toUpperCase();
    const stripeVerified =
      Boolean(stripeAccountId) &&
      (["ACTIVE", "VERIFIED", "READY"].includes(payoutStatus) || Boolean(payoutSnapshot?.stripePayoutsEnabled));
    if (!stripeVerified) continue;

    const distanceKm = haversineKm(
      { lat: job.lat, lng: job.lng },
      { lat: candidate.homeLatitude, lng: candidate.homeLongitude },
    );
    if (distanceKm > radiusKm) continue;

    contractors.push({
      contractorId: candidate.userId,
      businessName: candidate.businessName?.trim() || candidate.contactName?.trim() || "Contractor",
      contactName: candidate.contactName?.trim() || candidate.businessName?.trim() || "Contractor",
      tradeCategory: jobTradeCategory,
      yearsExperience: Number(candidate.yearsExperience ?? 0),
      city: candidate.city?.trim() || "",
      stripeVerified: true,
      distanceKm,
    });
  }

  contractors.sort((a, b) => a.distanceKm - b.distanceKm || a.businessName.localeCompare(b.businessName));

  const contractorPayoutCents = Number(job.contractorPayoutCents ?? 0);
  const routerEarningsCents = Number(job.routerEarningsCents ?? 0);
  const brokerFeeCents = Number(job.brokerFeeCents ?? 0);
  const transactionFeeCents = Number(job.transactionFeeCents ?? 0);
  const fallbackTotal = contractorPayoutCents + routerEarningsCents + brokerFeeCents + transactionFeeCents;
  const appraisalTotal =
    Number(job.totalAmountCents ?? 0) > 0
      ? Number(job.totalAmountCents)
      : Number(job.amountCents ?? 0) > 0
        ? Number(job.amountCents)
        : fallbackTotal;

  return {
    kind: "ok",
    job: {
      id: job.id,
      title: job.title,
      city: job.city ?? "",
      region: job.region ?? "",
      tradeCategory: jobTradeCategory,
      urbanOrRegional: job.jobType === "urban" ? "Urban" : "Regional",
      appraisalTotal,
      createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : "",
      radiusKm,
    },
    contractors,
  };
}
