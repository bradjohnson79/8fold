import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs } from "../../../db/schema/job";
import { getRegionName, type CountryCode2 } from "../../locations/datasets";

/**
 * Public discovery eligibility. Restored to OPEN_FOR_ROUTING to fix Option B regression.
 * Used by listRegionsWithJobs, countEligiblePublicJobs.
 */
function publicEligibility() {
  return and(
    eq(jobs.archived, false),
    eq(jobs.status, "OPEN_FOR_ROUTING"),
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

/**
 * Minimal city list for dropdown (cities-with-jobs). Restored to avoid Option B regression.
 * SELECT DISTINCT city only. No GROUP BY, no counts.
 */
export async function listCitiesByRegion(
  country: CountryCode2,
  regionCode: string,
): Promise<Array<{ city: string; jobCount: number }>> {
  const rc = regionCode.trim().toUpperCase();
  if (!rc) return [];
  if (!isAllowedRegion(country, rc)) return [];

  const res = await db.execute<{ city: string | null }>(
    sql`
      SELECT DISTINCT city
      FROM jobs
      WHERE region_code = ${rc}
        AND country = ${country}
        AND status = 'OPEN_FOR_ROUTING'
        AND archived = false
        AND city IS NOT NULL
        AND city != ''
      ORDER BY city ASC
    `,
  );
  const rows = (res as { rows?: { city: string | null }[] })?.rows ?? [];
  return rows
    .map((r) => ({ city: String(r.city ?? "").trim(), jobCount: 0 }))
    .filter((r) => Boolean(r.city));
}

/**
 * Cities with job counts for Option B grid. Isolated — does not affect existing endpoints.
 * Powers /api/public/jobs/cities only.
 */
export async function listCitiesWithJobCounts(
  country: CountryCode2,
  regionCode: string,
): Promise<Array<{ city: string; jobCount: number }>> {
  const rc = regionCode.trim().toUpperCase();
  if (!rc) return [];
  if (!isAllowedRegion(country, rc)) return [];

  const res = await db.execute<{ city: string | null; job_count: number }>(
    sql`
      SELECT city, COUNT(*)::int AS job_count
      FROM jobs
      WHERE region_code = ${rc}
        AND country = ${country}
        AND status = 'OPEN_FOR_ROUTING'
        AND archived = false
        AND city IS NOT NULL
        AND city != ''
      GROUP BY city
      ORDER BY job_count DESC
    `,
  );
  const rows = (res as { rows?: { city: string | null; job_count: number }[] })?.rows ?? [];
  return rows
    .map((r) => ({ city: String(r.city ?? "").trim(), jobCount: Number(r.job_count ?? 0) }))
    .filter((r) => Boolean(r.city));
}

export type PublicNewestJobRow = {
  id: string;
  title: string | null;
  trade_category: string | null;
  region: string | null;
  city: string | null;
  amount_cents: number | null;
  currency: string | null;
  created_at: Date | string | null;
};

/**
 * Minimal newest jobs for public discovery. Restored to avoid Option B regression.
 * No joins, no extra fields. Uses OPEN_FOR_ROUTING only.
 */
export async function listNewestJobs(limit: number): Promise<PublicNewestJobRow[]> {
  const take = Math.max(1, Math.min(50, Math.trunc(limit || 9)));
  const res = await db.execute<PublicNewestJobRow>(
    sql`
      SELECT id, title, trade_category, region, city, amount_cents, currency, created_at
      FROM jobs
      WHERE status = 'OPEN_FOR_ROUTING'
        AND archived = false
      ORDER BY created_at DESC
      LIMIT ${take}
    `,
  );
  return (res as { rows?: PublicNewestJobRow[] })?.rows ?? [];
}

export async function countEligiblePublicJobs(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(publicEligibility())
    .limit(1);
  return Number(rows[0]?.count ?? 0);
}

export type PublicJobMinimalRow = {
  id: string;
  title: string | null;
  trade_category: string | null;
  region: string | null;
  city: string | null;
  amount_cents: number | null;
  currency: string | null;
  created_at: Date | string | null;
};

export async function listJobsByLocation(opts: {
  country: CountryCode2;
  regionCode: string;
  city: string;
}): Promise<PublicJobMinimalRow[]> {
  const rc = opts.regionCode.trim().toUpperCase();
  const city = opts.city.trim();
  if (!rc || !city) return [];

  function slugCity(cityName: string): string {
    return cityName.trim().toLowerCase().replace(/\s+/g, "-");
  }
  const regionSlug = `${slugCity(city)}-${rc.toLowerCase()}`;

  void opts.country;

  try {
    const res = await db.execute<PublicJobMinimalRow>(
      sql`
        SELECT id, title, trade_category, region, city, amount_cents, currency, created_at
        FROM jobs
        WHERE status = 'OPEN_FOR_ROUTING'
          AND archived = false
          AND region_code IS NOT NULL
          AND region_code = ${rc}
          AND (lower(city) = lower(${city}) OR region = ${regionSlug})
        ORDER BY published_at DESC, id DESC
        LIMIT 200
      `,
    );
    const rows = (res as { rows?: PublicJobMinimalRow[] })?.rows ?? [];
    return rows;
  } catch (err: unknown) {
    const pg = (err as { cause?: Record<string, unknown>; code?: string; column?: string }) ?? {};
    const cause = (pg.cause ?? pg) as Record<string, unknown>;
    console.error("[PUBLIC_JOBS_BY_LOCATION] select_failed", {
      code: cause.code ?? pg.code,
      column: cause.column ?? pg.column,
      message: cause.message ?? (err as Error)?.message,
    });
    throw err;
  }
}

