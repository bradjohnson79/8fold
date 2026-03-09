import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs } from "../../../db/schema/job";
import { getRegionName, type CountryCode2 } from "../../locations/datasets";

/** Marketplace visibility: only jobs actively available or in progress. */
function publicEligibility() {
  return and(
    eq(jobs.archived, false),
    sql`${jobs.status} IN ('OPEN_FOR_ROUTING', 'IN_PROGRESS')`,
  );
}

/** Same marketplace filter used for city/region aggregation queries. */
function publicEligibilityForLocations() {
  return and(
    eq(jobs.archived, false),
    sql`${jobs.status} IN ('OPEN_FOR_ROUTING', 'IN_PROGRESS')`,
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
 * City list with job counts and latest activity for dropdowns and region pages.
 * Groups by LOWER(TRIM(city)) to merge case/whitespace variants.
 */
export async function listCitiesByRegion(
  country: CountryCode2,
  regionCode: string,
): Promise<Array<{ city: string; jobCount: number; latestActivity: string | null }>> {
  const rc = regionCode.trim().toUpperCase();
  if (!rc) return [];
  if (!isAllowedRegion(country, rc)) return [];

  const res = await db.execute<{ city: string | null; job_count: number; latest_activity: string | null }>(
    sql`
      SELECT
        INITCAP(TRIM(city)) AS city,
        COUNT(*)::int AS job_count,
        MAX(COALESCE(published_at, created_at))::text AS latest_activity
      FROM jobs
      WHERE region_code = ${rc}
        AND country = ${country}
        AND status IN ('OPEN_FOR_ROUTING', 'IN_PROGRESS')
        AND archived = false
        AND city IS NOT NULL
        AND city != ''
      GROUP BY LOWER(TRIM(city))
      ORDER BY city ASC
    `,
  );
  const rows = (res as { rows?: { city: string | null; job_count: number; latest_activity: string | null }[] })?.rows ?? [];
  return rows
    .map((r) => ({
      city: String(r.city ?? "").trim(),
      jobCount: Number(r.job_count ?? 0),
      latestActivity: r.latest_activity ?? null,
    }))
    .filter((r) => Boolean(r.city));
}

/**
 * Cities with job counts for grid display. Normalized grouping merges case/whitespace variants.
 * Powers /api/public/jobs/cities only.
 */
export async function listCitiesWithJobCounts(
  country: CountryCode2,
  regionCode: string,
): Promise<Array<{ city: string; jobCount: number; latestActivity: string | null }>> {
  const rc = regionCode.trim().toUpperCase();
  if (!rc) return [];
  if (!isAllowedRegion(country, rc)) return [];

  const res = await db.execute<{ city: string | null; job_count: number; latest_activity: string | null }>(
    sql`
      SELECT
        INITCAP(TRIM(city)) AS city,
        COUNT(*)::int AS job_count,
        MAX(COALESCE(published_at, created_at))::text AS latest_activity
      FROM jobs
      WHERE region_code = ${rc}
        AND country = ${country}
        AND status IN ('OPEN_FOR_ROUTING', 'IN_PROGRESS')
        AND archived = false
        AND city IS NOT NULL
        AND city != ''
      GROUP BY LOWER(TRIM(city))
      ORDER BY job_count DESC
    `,
  );
  const rows = (res as { rows?: { city: string | null; job_count: number; latest_activity: string | null }[] })?.rows ?? [];
  return rows
    .map((r) => ({
      city: String(r.city ?? "").trim(),
      jobCount: Number(r.job_count ?? 0),
      latestActivity: r.latest_activity ?? null,
    }))
    .filter((r) => Boolean(r.city));
}

export type PublicNewestJobRow = {
  id: string;
  title: string | null;
  scope: string | null;
  trade_category: string | null;
  status: string | null;
  routing_status: string | null;
  region: string | null;
  region_name: string | null;
  city: string | null;
  photo_urls: string[] | null;
  amount_cents: number | null;
  currency: string | null;
  router_earnings_cents: number | null;
  contractor_payout_cents: number | null;
  broker_fee_cents: number | null;
  published_at: Date | string | null;
  created_at: Date | string | null;
};

/**
 * Canonical projection for public newest jobs. Strict column list prevents schema drift.
 * Marketplace visibility: OPEN_FOR_ROUTING and IN_PROGRESS only.
 */
export async function listNewestJobs(limit: number): Promise<PublicNewestJobRow[]> {
  const take = Math.max(1, Math.min(50, Math.trunc(limit || 9)));
  const res = await db.execute<PublicNewestJobRow>(
    sql`
      SELECT
        id, title, scope, trade_category, status, routing_status,
        region, region_name, city, photo_urls,
        amount_cents, currency,
        router_earnings_cents, contractor_payout_cents, broker_fee_cents,
        published_at, created_at
      FROM jobs
      WHERE archived = false
        AND status IN ('OPEN_FOR_ROUTING', 'IN_PROGRESS')
      ORDER BY published_at DESC, id DESC
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
  scope: string | null;
  trade_category: string | null;
  status: string | null;
  routing_status: string | null;
  region: string | null;
  region_name: string | null;
  city: string | null;
  photo_urls: string[] | null;
  amount_cents: number | null;
  currency: string | null;
  router_earnings_cents: number | null;
  contractor_payout_cents: number | null;
  broker_fee_cents: number | null;
  published_at: Date | string | null;
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
        SELECT
          id, title, scope, trade_category, status, routing_status,
          region, region_name, city, photo_urls,
          amount_cents, currency,
          router_earnings_cents, contractor_payout_cents, broker_fee_cents,
          published_at, created_at
        FROM jobs
        WHERE archived = false
          AND status IN ('OPEN_FOR_ROUTING', 'IN_PROGRESS')
          AND region_code IS NOT NULL
          AND region_code = ${rc}
          AND (LOWER(TRIM(city)) = LOWER(TRIM(${city})) OR region = ${regionSlug})
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

