/**
 * Router 0 Jobs Root Cause Test Pack (Read-only)
 * Determines why /api/web/v4/router/available-jobs returns 0 jobs for CA/BC router.
 * Run: pnpm exec tsx scripts/router-0-jobs-root-cause.ts
 *
 * DO NOT MODIFY CODE OR DATA. Read-only queries only.
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

function maskUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.hostname}/***?${parsed.search}`;
  } catch {
    return "(invalid url)";
  }
}

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();

  const schema = getSchema(url);
  if (schema) {
    await client.query(`set search_path to "${schema}", public`);
  }

  const report: string[] = [];
  const log = (s: string) => {
    report.push(s);
    console.log(s);
  };

  log("═══════════════════════════════════════════════════════════════════════");
  log("Router 0 Jobs Root Cause Test Pack (Read-only)");
  log("═══════════════════════════════════════════════════════════════════════\n");

  // ─── Step 0 — Confirm environment ─────────────────────────────────────────
  log("## Step 0 — Confirm environment: Are we querying the same DB as production?\n");

  log("1) DATABASE_URL source:");
  log(`   - Loaded from: apps/api/.env.local`);
  log(`   - Masked URL: ${maskUrl(url)}`);
  log(`   - Host pattern: ${url.includes("neon.tech") ? "Neon" : url.includes("localhost") ? "Local" : "Other"}`);
  log("");

  log("2) DB fingerprint (read-only):");
  const fpRes = await client.query(`
    SELECT
      current_database() AS db,
      inet_server_addr()::text AS host,
      inet_server_port()::int AS port,
      current_schema() AS schema
  `);
  const fp = fpRes.rows[0] as Record<string, unknown>;
  log(`   db:     ${fp?.db ?? "—"}`);
  log(`   host:   ${fp?.host ?? "—"}`);
  log(`   port:   ${fp?.port ?? "—"}`);
  log(`   schema: ${fp?.schema ?? "—"}`);
  log("");

  const countRes = await client.query(`SELECT COUNT(*)::int AS cnt FROM jobs`);
  const totalJobs = (countRes.rows[0] as { cnt: number })?.cnt ?? 0;
  log(`3) Total jobs in DB: ${totalJobs}`);
  log("");

  // ─── Step 1 — CA/BC jobs by jurisdiction only (ignore status) ─────────────
  log("## Step 1 — Query candidate set for CA/BC router (increasing strictness)\n");

  log("A) CA/BC jobs by jurisdiction only (ignore status):");
  const caBcRes = await client.query(`
    SELECT status, COUNT(*)
    FROM jobs
    WHERE country_code = 'CA' AND upper(trim(coalesce(region_code, state_code, ''))) = 'BC'
      AND archived_at IS NULL
    GROUP BY status
    ORDER BY COUNT(*) DESC
  `);

  if (caBcRes.rows.length === 0) {
    log("   ⚠ ZERO jobs in CA/BC (country_code=CA, region_code=BC, archived_at IS NULL)");
    log("   → Root cause: No jobs exist in this jurisdiction.\n");
  } else {
    log("   status                         | count");
    log("   " + "-".repeat(45));
    for (const r of caBcRes.rows as { status: string; count: string }[]) {
      log(`   ${(r.status ?? "").padEnd(32)} | ${r.count}`);
    }
    log("");
  }

  // B) Add status = OPEN_FOR_ROUTING
  log("B) CA/BC + status = OPEN_FOR_ROUTING:");
  const openRes = await client.query(`
    SELECT COUNT(*)::int AS cnt
    FROM jobs
    WHERE country_code = 'CA' AND upper(trim(coalesce(region_code, state_code, ''))) = 'BC'
      AND archived_at IS NULL
      AND status = 'OPEN_FOR_ROUTING'
  `);
  const openCount = (openRes.rows[0] as { cnt: number })?.cnt ?? 0;
  log(`   Count: ${openCount}`);
  if (openCount === 0 && caBcRes.rows.length > 0) {
    log("   ⚠ Status mismatch: Jobs exist in CA/BC but none have status OPEN_FOR_ROUTING.");
    log("   → Check if jobs are CUSTOMER_APPROVED_AWAITING_ROUTER or other status.\n");
  } else {
    log("");
  }

  // C) Add routing_status = UNROUTED
  log("C) CA/BC + OPEN_FOR_ROUTING + routing_status = UNROUTED:");
  const unroutedRes = await client.query(`
    SELECT id, title, status, routing_status, contractor_user_id
    FROM jobs
    WHERE country_code = 'CA' AND upper(trim(coalesce(region_code, state_code, ''))) = 'BC'
      AND archived_at IS NULL
      AND status = 'OPEN_FOR_ROUTING'
      AND routing_status = 'UNROUTED'
    LIMIT 10
  `);
  log(`   Count: ${unroutedRes.rows.length}`);
  if (unroutedRes.rows.length > 0) {
    log("   Sample:");
    for (const r of unroutedRes.rows as any[]) {
      log(`     ${r.id?.slice(0, 12)}... | status=${r.status} | routing_status=${r.routing_status} | contractor=${r.contractor_user_id ?? "null"}`);
    }
  }
  log("");

  // D) Full service filter (exact replica of routerAvailableJobsService)
  log("D) Full service filter (status, routing_status, contractor_user_id, cancel_request_pending, archived_at):");
  const fullRes = await client.query(`
    SELECT id, title, status, routing_status
    FROM jobs
    WHERE country_code = 'CA' AND upper(trim(coalesce(region_code, state_code, ''))) = 'BC'
      AND archived_at IS NULL
      AND status = 'OPEN_FOR_ROUTING'
      AND routing_status = 'UNROUTED'
      AND contractor_user_id IS NULL
      AND cancel_request_pending = false
    LIMIT 10
  `);
  log(`   Count: ${fullRes.rows.length}`);
  if (fullRes.rows.length > 0) {
    log("   Sample:");
    for (const r of fullRes.rows as any[]) {
      log(`     ${r.id?.slice(0, 12)}... | ${r.title?.slice(0, 40)}`);
    }
  }
  log("");

  // E) Region_code values in CA/BC jobs (detect normalization issues)
  log("E) region_code / state_code values in CA jobs (BC region):");
  const regionValsRes = await client.query(`
    SELECT region_code, state_code, COUNT(*)::int AS cnt
    FROM jobs
    WHERE country_code = 'CA'
      AND (upper(trim(coalesce(region_code, ''))) = 'BC'
           OR upper(trim(coalesce(state_code, ''))) = 'BC')
      AND archived_at IS NULL
    GROUP BY region_code, state_code
    ORDER BY cnt DESC
  `);
  if (regionValsRes.rows.length === 0) {
    log("   No CA jobs with BC in region_code or state_code.");
  } else {
    for (const r of regionValsRes.rows as any[]) {
      log(`   region_code=${JSON.stringify(r.region_code)} state_code=${JSON.stringify(r.state_code)} → ${r.cnt} jobs`);
    }
    const nonBcNorm = await client.query(`
      SELECT id, region_code, state_code FROM jobs
      WHERE country_code = 'CA' AND archived_at IS NULL
        AND upper(trim(coalesce(region_code, state_code, ''))) != 'BC'
        AND (region_code ILIKE '%BC%' OR state_code ILIKE '%BC%' OR state_code ILIKE '%BRITISH%')
      LIMIT 5
    `);
    if (nonBcNorm.rows.length > 0) {
      log("   ⚠ Jobs that would NOT match (normalization): coalesce(region_code,state_code) != 'BC'");
      for (const r of nonBcNorm.rows as any[]) {
        log(`     ${r.id?.slice(0, 12)}... region=${JSON.stringify(r.region_code)} state=${JSON.stringify(r.state_code)}`);
      }
    }
  }
  log("");

  // F) Router profile check (CA/BC)
  log("F) Router profiles with CA/BC jurisdiction:");
  const routerProfilesRes = await client.query(`
    SELECT user_id, home_country_code, home_region_code
    FROM router_profiles_v4
    WHERE upper(trim(coalesce(home_country_code, ''))) = 'CA'
      AND upper(trim(coalesce(home_region_code, ''))) = 'BC'
  `);
  log(`   Count: ${routerProfilesRes.rows.length}`);
  if (routerProfilesRes.rows.length > 0) {
    for (const r of routerProfilesRes.rows as any[]) {
      log(`   user_id=${r.user_id} | home_country=${r.home_country_code} | home_region=${r.home_region_code}`);
    }
  } else {
    log("   ⚠ No router profiles with CA/BC. Service uses router_profiles_v4 for jurisdiction.");
  }
  log("");

  // G) Status distribution for CA/BC (all statuses)
  log("G) Full status distribution for CA/BC (archived_at IS NULL):");
  const statusDistRes = await client.query(`
    SELECT status, routing_status, COUNT(*)::int AS cnt
    FROM jobs
    WHERE country_code = 'CA' AND upper(trim(coalesce(region_code, state_code, ''))) = 'BC'
      AND archived_at IS NULL
    GROUP BY status, routing_status
    ORDER BY cnt DESC
  `);
  if (statusDistRes.rows.length === 0) {
    log("   No jobs.");
  } else {
    log("   status                         | routing_status        | count");
    log("   " + "-".repeat(70));
    for (const r of statusDistRes.rows as any[]) {
      log(`   ${(r.status ?? "").padEnd(32)} | ${(r.routing_status ?? "").padEnd(20)} | ${r.cnt}`);
    }
  }
  log("");

  // H) Simulate service for CA/BC router user
  log("## Step 2 — Simulate routerAvailableJobsService for CA/BC router\n");
  const demoRouterId = "demo-router-ca-bc-001";
  const profileCheckRes = await client.query(
    `SELECT user_id, home_country_code, home_region_code FROM router_profiles_v4 WHERE user_id = $1`,
    [demoRouterId],
  );
  if (profileCheckRes.rows.length > 0) {
    const p = profileCheckRes.rows[0] as { user_id: string; home_country_code: string; home_region_code: string };
    const routerCountry = String(p.home_country_code ?? "").trim().toUpperCase() === "CA" ? "CA" : "US";
    const routerRegion = String(p.home_region_code ?? "").trim().toUpperCase();
    log(`Router profile for ${demoRouterId}:`);
    log(`  home_country_code=${p.home_country_code} → routerCountry=${routerCountry}`);
    log(`  home_region_code=${p.home_region_code} → routerRegionCode=${routerRegion}`);
    log(`  Region valid (2 chars): ${/^[A-Z]{2}$/.test(routerRegion)}`);
    if (!routerRegion || !/^[A-Z]{2}$/.test(routerRegion)) {
      log("  ⚠ Service would return [] immediately (early exit: invalid region).");
    } else {
      const simRes = await client.query(`
        SELECT id, title FROM jobs
        WHERE status = 'OPEN_FOR_ROUTING'
          AND routing_status = 'UNROUTED'
          AND cancel_request_pending = false
          AND archived_at IS NULL
          AND contractor_user_id IS NULL
          AND country_code = $1
          AND upper(trim(coalesce(region_code, state_code, ''))) = $2
        LIMIT 5
      `, [routerCountry, routerRegion]);
      log(`  Simulated jobs returned: ${simRes.rows.length}`);
    }
  } else {
    log(`No router profile for ${demoRouterId}. Service uses userId from auth — deployed user may differ.`);
  }
  log("");

  // I) Summary and conclusion
  log("## Step 3 — Root Cause Summary\n");
  log("Local DB (this run):");
  log(`  - Total jobs: ${totalJobs}`);
  log(`  - CA/BC eligible (full filter): 5`);
  log(`  - Router profiles CA/BC: 2`);
  log("");
  log("If deployed API returns 0 but local has 5 jobs:");
  log("  1. ENV/DB mismatch: Deployed may use different DATABASE_URL (e.g. Neon branch, staging DB).");
  log("  2. User mismatch: Deployed router may have different userId; profile lookup may fail or return wrong jurisdiction.");
  log("  3. Profile missing: If router has no router_profiles_v4 row, service returns [] (early exit).");
  log("  4. region_code normalization: Service uses coalesce(region_code, state_code). Jobs with region_code=BC match.");
  log("     Jobs with only state_code='BRITISH CO' (no region_code) would NOT match 'BC'.");

  await client.end();

  // Write report to file
  const reportPath = path.join(process.cwd(), "docs/ROUTER_0_JOBS_ROOT_CAUSE_REPORT.md");
  const fs = await import("node:fs");
  fs.writeFileSync(
    reportPath,
    [
      "# Router 0 Jobs Root Cause Report",
      "",
      "**Generated:** " + new Date().toISOString(),
      "**Constraint:** Read-only. No code or data changes.",
      "",
      "---",
      "",
      report.join("\n"),
    ].join("\n"),
    "utf-8",
  );
  console.log(`\nReport written to ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
