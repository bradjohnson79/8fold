import { and, asc, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs } from "../../../db/schema/job";
import { getRegionName, type CountryCode2 } from "../../locations/datasets";

function publicEligibility() {
  return and(
    eq(jobs.archived, false),
    or(
      eq(jobs.status, "ASSIGNED"),
      and(
        eq(jobs.status, "CUSTOMER_APPROVED"),
        isNull(jobs.router_approved_at)
      )
    )
  );
}

const US_STATE_CODES_50 = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
]);

const CA_PROVINCE_CODES_10 = new Set([
  "AB","BC","MB","NB","NL","NS","ON","PE","QC","SK",
]);

function isAllowedRegion(country: CountryCode2, regionCode: string): boolean {
  const rc = regionCode.trim().toUpperCase();
  if (country === "US") return US_STATE_CODES_50.has(rc);
  return CA_PROVINCE_CODES_10.has(rc);
}

async function maybeLogPublicDiscoveryDiagnostics(): Promise<void> {
  // Dev-only, opt-in diagnostics.
  if (process.env.NODE_ENV === "production") return;
  if (String(process.env.PUBLIC_DISCOVERY_DEBUG ?? "").trim() !== "true") return;

  const counts = await db
    .select({ status: jobs.status, count: sql<number>`count(*)::int` })
    .from(jobs)
    .groupBy(jobs.status);
  // eslint-disable-next-line no-console
  console.log("JOB STATUS COUNTS:", counts);

  const regions = await db
    .selectDistinct({ regionCode: jobs.region_code })
    .from(jobs)
    .where(and(publicEligibility(), isNotNull(jobs.region_code)));
  // eslint-disable-next-line no-console
  console.log("REGIONS FROM ELIGIBLE JOBS:", regions);
}

export async function listRegionsWithJobs(): Promise<
  Array<{ country: CountryCode2; regionCode: string; regionName: string; jobCount: number }>
> {
  await maybeLogPublicDiscoveryDiagnostics();
  const rows = await db
    .select({
      country: jobs.country,
      regionCode: jobs.region_code,
      jobCount: sql<number>`count(*)::int`,
    })
    .from(jobs)
    .where(and(publicEligibility(), isNotNull(jobs.region_code)))
    .groupBy(jobs.country, jobs.region_code)
    .orderBy(asc(jobs.country), asc(jobs.region_code));

  const mapped = rows
    .map((r) => {
      const country = (String(r.country ?? "US").trim().toUpperCase() === "CA" ? "CA" : "US") as CountryCode2;
      const rc = String(r.regionCode ?? "").trim().toUpperCase();
      if (!rc) return null;
      if (!isAllowedRegion(country, rc)) return null;
      return { country, regionCode: rc, regionName: getRegionName(country, rc) ?? rc, jobCount: r.jobCount ?? 0 };
    })
    .filter(
      (x): x is { country: CountryCode2; regionCode: string; regionName: string; jobCount: number } => x !== null,
    );

  // Required UX ordering: all US states first, then all CA provinces; within each, alphabetical by name.
  return mapped.sort((a, b) => {
    const ca = a.country === "CA";
    const cb = b.country === "CA";
    if (ca !== cb) return ca ? 1 : -1;
    return a.regionName.localeCompare(b.regionName) || a.regionCode.localeCompare(b.regionCode);
  });
}

export async function listCitiesByRegion(
  country: CountryCode2,
  regionCode: string,
): Promise<Array<{ city: string; jobCount: number }>> {
  const rc = regionCode.trim().toUpperCase();
  if (!rc) return [];
  if (!isAllowedRegion(country, rc)) return [];

  // DB truth only: cities come from Job.city (no slug derivation).
  // This keeps selector deterministic and avoids client-side heuristics.
  await maybeLogPublicDiscoveryDiagnostics();
  const rows = await db
    .select({ city: jobs.city, jobCount: sql<number>`count(*)::int` })
    .from(jobs)
    .where(
      and(
        publicEligibility(),
        eq(jobs.country, country as any),
        isNotNull(jobs.region_code),
        eq(jobs.region_code, rc),
        isNotNull(jobs.city),
      ),
    )
    .groupBy(jobs.city)
    .orderBy(asc(jobs.city))
    .limit(5000);

  return rows
    .map((r) => ({ city: String(r.city ?? "").trim(), jobCount: Number(r.jobCount ?? 0) }))
    .filter((r) => Boolean(r.city));
}

export type PublicNewestJobRow = {
  id: string;
  title: string;
  status: string;
  region: string;
  country: string;
  city: string | null;
  tradeCategory: string | null;
  createdAt: Date;
  laborTotalCents: number;
  contractorPayoutCents: number;
  routerEarningsCents: number;
  brokerFeeCents: number;
  materialsTotalCents: number;
  transactionFeeCents: number;
  amountCents: number;
  paymentStatus: string;
  publicStatus: string;
};

export async function listNewestJobs(limit: number): Promise<PublicNewestJobRow[]> {
  const take = Math.max(1, Math.min(50, Math.trunc(limit || 9)));
  await maybeLogPublicDiscoveryDiagnostics();
  const result = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
      region: jobs.region,
      country: jobs.country,
      city: jobs.city,
      tradeCategory: jobs.trade_category,
      createdAt: jobs.created_at,
      laborTotalCents: jobs.labor_total_cents,
      contractorPayoutCents: jobs.contractor_payout_cents,
      routerEarningsCents: jobs.router_earnings_cents,
      brokerFeeCents: jobs.broker_fee_cents,
      materialsTotalCents: jobs.materials_total_cents,
      transactionFeeCents: jobs.transaction_fee_cents,
      amountCents: jobs.amount_cents,
      paymentStatus: jobs.payment_status,
      publicStatus: jobs.public_status,
    })
    .from(jobs)
    .where(publicEligibility())
    .orderBy(desc(jobs.created_at), desc(jobs.id))
    .limit(take);

  if (process.env.NODE_ENV !== "production") {
    for (const row of result) {
      if (row.laborTotalCents === undefined) {
        throw new Error(
          "Public jobs query missing laborTotalCents — financial schema drift detected.",
        );
      }
    }
  }

  return result;
}

export async function countEligiblePublicJobs(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(publicEligibility())
    .limit(1);
  return Number(rows[0]?.count ?? 0);
}

export async function listJobsByLocation(opts: {
  country: CountryCode2;
  regionCode: string;
  city: string;
}): Promise<Array<typeof jobs.$inferSelect>> {
  const rc = opts.regionCode.trim().toUpperCase();
  const city = opts.city.trim();
  if (!rc || !city) return [];

  function slugCity(cityName: string): string {
    return cityName.trim().toLowerCase().replace(/\s+/g, "-");
  }
  const regionSlug = `${slugCity(city)}-${rc.toLowerCase()}`;

  // Country param is accepted for signature parity; current behavior is regionCode-driven.
  void opts.country;

  return await db
    .select()
    .from(jobs)
    .where(
      and(
        publicEligibility(),
        isNotNull(jobs.region_code),
        eq(jobs.region_code, rc),
        // Legacy behavior: match either explicit city (case-insensitive) OR region slug
        sql`(lower(${jobs.city}) = lower(${city}) OR ${jobs.region} = ${regionSlug})`,
      ),
    )
    .orderBy(desc(jobs.published_at), desc(jobs.id))
    .limit(200);
}

