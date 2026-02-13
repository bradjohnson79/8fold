import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../../../db/drizzle";
import { jobs } from "../../../db/schema/job";
import { getRegionDatasets, getRegionName, type CountryCode2 } from "../../locations/datasets";
import { regionToCityState } from "../../jobs/nominatim";

const PUBLIC_STATUSES = ["PUBLISHED", "OPEN_FOR_ROUTING", "IN_PROGRESS"] as const;

function publicEligibility() {
  // Match current public discovery behavior:
  // - archived=false
  // - status in PUBLISHED/OPEN_FOR_ROUTING/IN_PROGRESS
  // - include REAL (non-mock) OR any IN_PROGRESS (coverage jobs may be MOCK)
  return and(
    eq(jobs.archived, false),
    inArray(jobs.status, PUBLIC_STATUSES as unknown as any),
    or(and(eq(jobs.jobSource, "REAL"), eq(jobs.isMock, false)), eq(jobs.status, "IN_PROGRESS")),
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

export async function listNewestJobs(limit: number): Promise<Array<typeof jobs.$inferSelect>> {
  const take = Math.max(1, Math.min(50, Math.trunc(limit || 9)));
  return await db
    .select()
    .from(jobs)
    .where(publicEligibility())
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(take);
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

