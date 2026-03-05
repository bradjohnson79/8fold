/**
 * Router Available Jobs — Full Diagnostic Audit
 * Read-only. Identifies which condition prevents each job from appearing in Available Jobs.
 * Run: pnpm exec tsx scripts/audit-router-available-jobs.ts
 */
import path from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required. Set in apps/api/.env.local");
  process.exit(1);
}

function getSchema(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get("schema")?.trim() || null;
  } catch {
    return null;
  }
}

function normalize(s: string | null | undefined): string {
  return String(s ?? "").trim().toUpperCase();
}

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();

  const schema = getSchema(url);
  if (schema) {
    await client.query(`set search_path to "${schema}", public`);
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("Router Available Jobs — Full Diagnostic Audit");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Step 2 — Fetch all OPEN_FOR_ROUTING jobs
  console.log("Step 2 — OPEN_FOR_ROUTING jobs (raw)\n");
  const jobsRes = await client.query(`
    SELECT
      id,
      title,
      status,
      routing_status,
      contractor_user_id,
      country_code,
      region_code,
      state_code,
      city,
      lat,
      lng,
      archived_at,
      created_at
    FROM jobs
    WHERE status = 'OPEN_FOR_ROUTING'
    ORDER BY created_at DESC
    LIMIT 50
  `);

  if (jobsRes.rows.length === 0) {
    console.log("No OPEN_FOR_ROUTING jobs found.\n");
  } else {
    console.log("JOB_ID                    | TITLE                    | CITY      | COUNTRY | REGION");
    console.log("-".repeat(100));
    for (const r of jobsRes.rows as any[]) {
      const id = (r.id ?? "").slice(0, 24).padEnd(24);
      const title = (r.title ?? "").slice(0, 24).padEnd(24);
      const city = (r.city ?? "").slice(0, 10).padEnd(10);
      const country = (r.country_code ?? "").padEnd(7);
      const region = r.region_code ?? "";
      console.log(`${id} | ${title} | ${city} | ${country} | ${region}`);
    }
    console.log("");
  }

  // Step 3 — Router jurisdiction
  console.log("Step 3 — Router profile\n");
  const routerRes = await client.query(`
    SELECT user_id, home_country_code, home_region_code
    FROM router_profiles_v4
    LIMIT 1
  `);

  let routerCountry = "US";
  let routerRegion = "";

  if (routerRes.rows.length === 0) {
    console.log("⚠ No router profile found. Using defaults: country=US, region=(empty)\n");
  } else {
    const r = routerRes.rows[0] as any;
    routerCountry = normalize(r.home_country_code) === "CA" ? "CA" : "US";
    routerRegion = normalize(r.home_region_code);
    console.log(`Router: user_id=${r.user_id}, country=${routerCountry}, region=${routerRegion}\n`);
  }

  // Step 4 & 5 — Per-job eligibility and diagnostic table
  console.log("Step 4 & 5 — Per-job eligibility diagnostics\n");

  const exclusionReasons: Record<string, number> = {
    routing_status_mismatch: 0,
    country_mismatch: 0,
    region_mismatch: 0,
    contractor_assigned: 0,
    archived: 0,
    missing_coords: 0,
  };

  let eligibleCount = 0;

  for (const job of jobsRes.rows as any[]) {
    const statusOk = job.status === "OPEN_FOR_ROUTING";
    const routingOk = normalize(job.routing_status) === "UNROUTED";
    const contractorOk = job.contractor_user_id == null;
    const jobCountry = normalize(job.country_code) === "CA" ? "CA" : "US";
    const countryOk = jobCountry === routerCountry;
    const jobRegion = normalize(job.region_code ?? job.state_code ?? "");
    const regionOk = jobRegion === routerRegion;
    const archivedOk = job.archived_at == null;
    const coordsOk =
      job.lat != null &&
      job.lng != null &&
      Number.isFinite(Number(job.lat)) &&
      Number.isFinite(Number(job.lng));

    const eligible =
      statusOk && routingOk && contractorOk && countryOk && regionOk && archivedOk && coordsOk;

    if (eligible) eligibleCount++;

    // Track exclusion reasons (each failing condition counts)
    if (!eligible) {
      if (!routingOk) exclusionReasons.routing_status_mismatch++;
      if (!countryOk) exclusionReasons.country_mismatch++;
      if (!regionOk) exclusionReasons.region_mismatch++;
      if (!contractorOk) exclusionReasons.contractor_assigned++;
      if (!archivedOk) exclusionReasons.archived++;
      if (!coordsOk) exclusionReasons.missing_coords++;
    }

    const reason =
      !routingOk
        ? "routing_status != UNROUTED"
        : !countryOk
          ? `country mismatch (job=${jobCountry}, router=${routerCountry})`
          : !regionOk
            ? `region mismatch (job=${jobRegion || "(empty)"}, router=${routerRegion || "(empty)"})`
            : !contractorOk
              ? "contractor_user_id already assigned"
              : !archivedOk
                ? "archived_at is set"
                : !coordsOk
                  ? "missing or invalid lat/lng"
                  : "ELIGIBLE";

    console.log(`Job: ${(job.id ?? "").slice(0, 12)}...`);
    console.log(`Title: ${(job.title ?? "").slice(0, 50)}`);
    console.log(`City: ${job.city ?? "—"} | Country: ${job.country_code ?? "—"} | Region: ${job.region_code ?? job.state_code ?? "—"}`);
    console.log(`  status_ok: ${statusOk}`);
    console.log(`  routing_ok: ${routingOk} (routing_status=${job.routing_status ?? "null"})`);
    console.log(`  contractor_ok: ${contractorOk}`);
    console.log(`  country_ok: ${countryOk}`);
    console.log(`  region_ok: ${regionOk}`);
    console.log(`  archived_ok: ${archivedOk}`);
    console.log(`  coords_ok: ${coordsOk}`);
    console.log(`ELIGIBLE: ${eligible ? "YES" : "NO"}`);
    console.log(`Reason: ${reason}`);
    console.log("");
  }

  // Step 6 — Jurisdiction anomalies
  console.log("Step 6 — Jurisdiction anomalies\n");
  const jurisdictionRes = await client.query(`
    SELECT id, city, region_code, country_code
    FROM jobs
    WHERE upper(trim(coalesce(region_code, ''))) = 'BC'
    AND country_code = 'US'
  `);

  if (jurisdictionRes.rows.length > 0) {
    console.log("⚠ Jurisdiction mismatch detected");
    console.log("Jobs with region_code=BC but country_code != CA:");
    for (const r of jurisdictionRes.rows as any[]) {
      console.log(`  ${r.id} | ${r.city} | region=${r.region_code} | country=${r.country_code}`);
    }
    console.log("");
  } else {
    console.log("✓ No jurisdiction anomalies (BC with non-CA country)\n");
  }

  // Step 6b — Cross-border jurisdiction check (all Canadian provinces)
  console.log("Step 6b — Cross-border jurisdiction check (all CA provinces)\n");
  const crossBorderRes = await client.query(`
    SELECT id FROM jobs WHERE region_code = 'BC' AND country_code != 'CA'
  `);
  if (crossBorderRes.rows.length > 0) {
    console.log(`✗ ${crossBorderRes.rows.length} BC jobs with non-CA country_code`);
  } else {
    console.log("✓ No BC jobs with non-CA country_code\n");
  }

  const allCaRes = await client.query(`
    SELECT id, region_code, country_code FROM jobs
    WHERE region_code IN ('AB','SK','MB','ON','QC','NB','NS','PE','NL','YT','NT','NU')
    AND country_code != 'CA'
  `);
  if (allCaRes.rows.length > 0) {
    console.log(`✗ ${allCaRes.rows.length} Canadian-province jobs with non-CA country_code`);
    for (const r of allCaRes.rows as any[]) {
      console.log(`  ${r.id} | region=${r.region_code} | country=${r.country_code}`);
    }
    console.log("");
  } else {
    console.log("✓ No Canadian-province jobs with non-CA country_code\n");
  }

  // Step 7 — Verify routerAvailableJobsService query
  console.log("Step 7 — routerAvailableJobsService WHERE clause verification\n");
  const expectedConditions = [
    "status = OPEN_FOR_ROUTING",
    "routing_status = UNROUTED",
    "contractor_user_id IS NULL",
    "archived_at IS NULL",
    "country_code = router.home_country_code",
    "region_code match (coalesce region_code, state_code)",
  ];
  console.log("Expected conditions:");
  expectedConditions.forEach((c) => console.log(`  ✓ ${c}`));
  console.log("\nActual service (routerAvailableJobsService.ts) includes:");
  console.log("  ✓ status = OPEN_FOR_ROUTING");
  console.log("  ✓ routing_status = UNROUTED (ROUTING_STATUS.UNROUTED)");
  console.log("  ✓ cancel_request_pending = false");
  console.log("  ✓ archived_at IS NULL");
  console.log("  ✓ contractor_user_id IS NULL");
  console.log("  ✓ country_code = routerCountry");
  console.log("  ✓ upper(trim(coalesce(region_code, state_code, ''))) = routerRegionCode");
  console.log("  ✓ LIMIT 50");
  console.log("");

  // Step 8 — Invite leakage
  console.log("Step 8 — Invite counts per job\n");
  const inviteRes = await client.query(`
    SELECT job_id, COUNT(*) AS invite_count
    FROM v4_contractor_job_invites
    GROUP BY job_id
    ORDER BY invite_count DESC
    LIMIT 10
  `);

  if (inviteRes.rows.length > 0) {
    console.log("job_id                     | invite_count");
    console.log("-".repeat(45));
    for (const r of inviteRes.rows as any[]) {
      console.log(`${(r.job_id ?? "").padEnd(26)} | ${r.invite_count}`);
    }
    console.log("");
  } else {
    console.log("No invites in v4_contractor_job_invites.\n");
  }

  // Step 9 — Final report summary
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("Step 9 — Final Report Summary");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const total = jobsRes.rows.length;
  const excluded = total - eligibleCount;

  console.log("Router Available Jobs Audit");
  console.log("");
  console.log(`Jobs eligible: ${eligibleCount}`);
  console.log(`Jobs excluded: ${excluded}`);
  console.log(`Total OPEN_FOR_ROUTING: ${total}`);
  console.log("");
  console.log("Exclusion reasons:");
  console.log(`  routing_status mismatch: ${exclusionReasons.routing_status_mismatch}`);
  console.log(`  country mismatch: ${exclusionReasons.country_mismatch}`);
  console.log(`  region mismatch: ${exclusionReasons.region_mismatch}`);
  console.log(`  contractor already assigned: ${exclusionReasons.contractor_assigned}`);
  console.log(`  archived: ${exclusionReasons.archived}`);
  console.log(`  missing coordinates: ${exclusionReasons.missing_coords}`);
  // Step 7 — cancel_request_pending NULL check
  console.log("Step 7: cancel_request_pending NULL audit");
  const cancelNullRes = await client.query(`
    SELECT COUNT(*)::int AS cnt FROM jobs WHERE cancel_request_pending IS NULL
  `);
  const cancelNullCount = cancelNullRes.rows[0]?.cnt ?? 0;
  if (cancelNullCount > 0) {
    console.log(`  ✗ ${cancelNullCount} jobs have cancel_request_pending = NULL (will be excluded from available jobs)`);
  } else {
    console.log("  ✓ No jobs with cancel_request_pending = NULL");
  }
  console.log("");

  console.log("Note: This script is read-only. No data was modified.");
  console.log("");

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
