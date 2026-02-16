import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs } from "../../../db/schema/job";
import { PUBLIC_MARKETPLACE_JOB_STATUSES } from "../../constants/publicJobStatuses";
import { getRegionDatasets, getRegionName, type CountryCode2 } from "../../locations/datasets";
import { regionToCityState } from "../../jobs/nominatim";

function publicEligibility() {
  // Homepage "Newest jobs" discovery:
  // - archived=false
  // - status in OPEN_FOR_ROUTING/ASSIGNED/IN_PROGRESS (no PUBLISHED - enum drift fix)
  // - isMock=false, jobSource=REAL
  return and(
    eq(jobs.archived, false),
    eq(jobs.isMock, false),
    eq(jobs.jobSource, "REAL"),
    inArray(jobs.status, PUBLIC_MARKETPLACE_JOB_STATUSES as unknown as any),
  );
}

function countryByRegionCodeMap(): Map<string, CountryCode2> {
  const out = new Map<string, CountryCode2>();
  for (const ds of getRegionDatasets()) {
    for (const r of ds.regions) out.set(r.regionCode.toUpperCase(), ds.country);
  }
  return out;
}

export async function listRegionsWithJobs(): Promise<
  Array<{ country: CountryCode2; regionCode: string; regionName: string; jobCount: number }>
> {
  const rows = await db
    .select({
      regionCode: jobs.regionCode,
      jobCount: sql<number>`count(*)::int`,
    })
    .from(jobs)
    .where(and(publicEligibility(), isNotNull(jobs.regionCode)))
    .groupBy(jobs.regionCode)
    .orderBy(desc(sql<number>`count(*)`));

  const countryBy = countryByRegionCodeMap();
  return rows
    .map((r) => {
      const rc = String(r.regionCode ?? "").trim().toUpperCase();
      if (!rc) return null;
      const country: CountryCode2 = countryBy.get(rc) ?? "US";
      return { country, regionCode: rc, regionName: getRegionName(country, rc) ?? rc, jobCount: r.jobCount ?? 0 };
    })
    .filter(
      (x): x is { country: CountryCode2; regionCode: string; regionName: string; jobCount: number } =>
        x !== null && x.jobCount > 0,
    );
}

export async function listCitiesByRegion(
  country: CountryCode2,
  regionCode: string,
): Promise<Array<{ city: string; jobCount: number }>> {
  const rc = regionCode.trim().toUpperCase();
  if (!rc) return [];

  const rows = await db
    .select({ city: jobs.city, region: jobs.region })
    .from(jobs)
    .where(and(publicEligibility(), isNotNull(jobs.regionCode), eq(jobs.regionCode, rc)))
    .limit(5000);

  // Country param is accepted for signature parity; current behavior is regionCode-driven.
  void country;

  function titleCaseCity(slugOrCity: string): string {
    const cleaned = slugOrCity.trim().replace(/[-_]+/g, " ");
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const counts = new Map<string, number>();
  for (const r of rows) {
    const explicit = String((r.city ?? "") as any).trim();
    const derived = regionToCityState(String((r.region ?? "") as any))?.city ?? "";
    const cityName = explicit || derived;
    const finalCity = cityName.trim();
    if (!finalCity) continue;
    const key = titleCaseCity(finalCity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([city, jobCount]) => ({ city, jobCount }))
    .sort((a, b) => b.jobCount - a.jobCount || a.city.localeCompare(b.city))
    .slice(0, 50);
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
  const result = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
      region: jobs.region,
      country: jobs.country,
      city: jobs.city,
      tradeCategory: jobs.tradeCategory,
      createdAt: jobs.createdAt,
      laborTotalCents: jobs.laborTotalCents,
      contractorPayoutCents: jobs.contractorPayoutCents,
      routerEarningsCents: jobs.routerEarningsCents,
      brokerFeeCents: jobs.brokerFeeCents,
      materialsTotalCents: jobs.materialsTotalCents,
      transactionFeeCents: jobs.transactionFeeCents,
      amountCents: jobs.amountCents,
      paymentStatus: jobs.paymentStatus,
      publicStatus: jobs.publicStatus,
    })
    .from(jobs)
    .where(publicEligibility())
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
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
        isNotNull(jobs.regionCode),
        eq(jobs.regionCode, rc),
        // Legacy behavior: match either explicit city (case-insensitive) OR region slug
        sql`(lower(${jobs.city}) = lower(${city}) OR ${jobs.region} = ${regionSlug})`,
      ),
    )
    .orderBy(desc(jobs.publishedAt), desc(jobs.id))
    .limit(200);
}

