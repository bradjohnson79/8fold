/**
 * Repair script: backfill missing job location fields from job_poster_profiles_v4.
 *
 * Only updates jobs where at least one of city, postal_code, lat, lng is NULL.
 * Never overwrites jobs that already have complete location data.
 *
 * Run with:
 *   pnpm --filter @8fold/api tsx scripts/repair-job-locations.ts
 *
 * Dry-run mode (no writes):
 *   DRY_RUN=true pnpm --filter @8fold/api tsx scripts/repair-job-locations.ts
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const isDryRun = String(process.env.DRY_RUN ?? "").trim().toLowerCase() === "true";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log(`\n[repair-job-locations] Starting${isDryRun ? " (DRY RUN — no writes)" : ""}...\n`);

  // Count how many jobs have incomplete location data
  const countResult = await db.execute<{ incomplete: number }>(sql`
    SELECT COUNT(*)::int AS incomplete
    FROM jobs j
    WHERE (j.city IS NULL OR j.city = '')
       OR j.lat IS NULL
       OR j.lng IS NULL
       OR (j.postal_code IS NULL OR j.postal_code = '')
  `);
  const rows = (countResult as any)?.rows ?? countResult;
  const incompleteCount = Number((rows as any[])[0]?.incomplete ?? 0);
  console.log(`[repair-job-locations] Jobs with incomplete location data: ${incompleteCount}`);

  if (incompleteCount === 0) {
    console.log("[repair-job-locations] Nothing to repair. All jobs have location data.");
    await pool.end();
    return;
  }

  // Preview which jobs will be affected
  const preview = await db.execute<{
    job_id: string;
    job_poster_user_id: string;
    current_city: string | null;
    profile_city: string | null;
    profile_postal: string | null;
    profile_lat: number | null;
    profile_lng: number | null;
  }>(sql`
    SELECT
      j.id AS job_id,
      j.job_poster_user_id,
      j.city AS current_city,
      p.city AS profile_city,
      p.postal_code AS profile_postal,
      p.latitude AS profile_lat,
      p.longitude AS profile_lng
    FROM jobs j
    JOIN job_poster_profiles_v4 p ON p.user_id = j.job_poster_user_id
    WHERE (j.city IS NULL OR j.city = '')
       OR j.lat IS NULL
       OR j.lng IS NULL
       OR (j.postal_code IS NULL OR j.postal_code = '')
    LIMIT 20
  `);
  const previewRows = (preview as any)?.rows ?? preview;
  console.log("\n[repair-job-locations] Sample jobs to be updated (up to 20):");
  for (const row of previewRows as any[]) {
    console.log(
      `  job=${row.job_id} poster=${row.job_poster_user_id} ` +
      `current_city="${row.current_city ?? "(null)"}" → profile_city="${row.profile_city ?? "(null)"}"`,
    );
  }

  if (isDryRun) {
    console.log("\n[repair-job-locations] DRY RUN — skipping actual UPDATE.");
    await pool.end();
    return;
  }

  // Perform the backfill UPDATE
  const updateResult = await db.execute(sql`
    UPDATE jobs j
    SET
      city        = COALESCE(NULLIF(j.city, ''), p.city),
      postal_code = COALESCE(NULLIF(j.postal_code, ''), p.postal_code),
      address_full = COALESCE(NULLIF(j.address_full, ''),
                      COALESCE(p.formatted_address, p.address_line1)),
      lat         = COALESCE(j.lat, p.latitude),
      lng         = COALESCE(j.lng, p.longitude),
      updated_at  = NOW()
    FROM job_poster_profiles_v4 p
    WHERE p.user_id = j.job_poster_user_id
      AND (
        (j.city IS NULL OR j.city = '')
        OR j.lat IS NULL
        OR j.lng IS NULL
        OR (j.postal_code IS NULL OR j.postal_code = '')
      )
  `);

  const updatedCount = (updateResult as any)?.rowCount ?? (updateResult as any)?.rows?.length ?? "unknown";
  console.log(`\n[repair-job-locations] Updated ${updatedCount} job(s) with location data from profiles.`);

  // Verify remaining incomplete jobs (should have dropped for jobs with a profile)
  const remainingResult = await db.execute<{ remaining: number }>(sql`
    SELECT COUNT(*)::int AS remaining
    FROM jobs j
    WHERE (j.city IS NULL OR j.city = '')
       OR j.lat IS NULL
       OR j.lng IS NULL
       OR (j.postal_code IS NULL OR j.postal_code = '')
  `);
  const remainingRows = (remainingResult as any)?.rows ?? remainingResult;
  const remaining = Number((remainingRows as any[])[0]?.remaining ?? 0);
  console.log(`[repair-job-locations] Jobs still with incomplete location (no profile found): ${remaining}`);

  if (remaining > 0) {
    console.warn(
      `[repair-job-locations] WARNING: ${remaining} job(s) still have incomplete location ` +
      `because no matching job_poster_profiles_v4 row was found for their poster.`,
    );
  }

  console.log("\n[repair-job-locations] Done.\n");
  await pool.end();
}

main().catch((err) => {
  console.error("[repair-job-locations] FATAL:", err);
  process.exit(1);
});
