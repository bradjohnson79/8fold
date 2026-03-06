/**
 * Router Available Jobs Full Forensic Diagnostic Runner
 * Executes forensic SQL against the same DB the API uses.
 * Run: pnpm exec tsx scripts/run-router-available-jobs-forensic.ts
 *
 * Target router: 9bf8996b-ca31-45f4-b1a6-12ed0b4d1480 / brad@aetherx.co
 */
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required. Set in apps/api/.env.local");
  process.exit(1);
}

const ROUTER_USER_ID = "9bf8996b-ca31-45f4-b1a6-12ed0b4d1480";
const ROUTER_EMAIL = "brad@aetherx.co";

function getSchema(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get("schema")?.trim() || null;
  } catch {
    return null;
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
  log("Router Available Jobs Full Forensic Diagnostic");
  log("═══════════════════════════════════════════════════════════════════════\n");

  let stage1 = 0,
    stage2 = 0,
    stage3 = 0,
    stage4 = 0,
    stage5 = 0,
    stage6 = 0;
  let finalRows: Array<Record<string, unknown>> = [];
  let routerJurisdiction = "CA / BC";

  try {
    // Section 0
    log("========== Section 0 — Database fingerprint ==========\n");
    const fp = (await client.query(`
      SELECT current_database() AS current_database, current_schema() AS current_schema,
             inet_server_addr()::text AS server_addr, inet_server_port() AS server_port, now() AS db_now
    `)).rows[0] as Record<string, unknown>;
    log(`current_database: ${fp?.current_database}`);
    log(`current_schema: ${fp?.current_schema}`);
    log(`server_addr: ${fp?.server_addr}`);
    log(`server_port: ${fp?.server_port}`);
    log(`db_now: ${fp?.db_now}\n`);

    const counts = (await client.query(`
      SELECT (SELECT COUNT(*) FROM jobs) AS jobs_count,
             (SELECT COUNT(*) FROM router_profiles_v4) AS router_profiles_count,
             (SELECT COUNT(*) FROM "User") AS users_count
    `)).rows[0] as Record<string, unknown>;
    log(`jobs_count: ${counts?.jobs_count}`);
    log(`router_profiles_count: ${counts?.router_profiles_count}`);
    log(`users_count: ${counts?.users_count}\n`);

    // Section 1
    log("========== Section 1 — Router identity target ==========\n");
    const routerRows = await client.query(
      `SELECT u.id, u.email, u.role, rp.user_id AS router_profile_user_id, rp.contact_name, rp.phone,
              rp.home_country_code, rp.home_region_code, rp.home_region
       FROM "User" u LEFT JOIN router_profiles_v4 rp ON rp.user_id = u.id
       WHERE u.id = $1 OR u.email = $2`,
      [ROUTER_USER_ID, ROUTER_EMAIL],
    );
    if (routerRows.rows.length === 0) {
      log("⚠ No router user found for id or email\n");
    } else {
      for (const r of routerRows.rows as Record<string, unknown>[]) {
        log(`id=${r.id} email=${r.email} role=${r.role} profile_user_id=${r.router_profile_user_id ?? "null"} home_country=${r.home_country_code} home_region=${r.home_region_code}`);
      }
      if (routerRows.rows.length > 1) log("⚠ Multiple rows - check for duplicates\n");
      else log("");
    }

    const dupes = (await client.query(`
      SELECT user_id, COUNT(*) AS cnt FROM router_profiles_v4 GROUP BY user_id HAVING COUNT(*) > 1
    `)).rows;
    if (dupes.length > 0) {
      log("⚠ Duplicate router profile rows:");
      for (const d of dupes as Record<string, unknown>[]) log(`  user_id=${d.user_id} cnt=${d.cnt}`);
      log("");
    }

    // Section 2
    log("========== Section 2 — Router jurisdiction ==========\n");
    const jurRows = await client.query(
      `SELECT user_id, home_country_code, home_region_code,
              UPPER(TRIM(COALESCE(home_country_code, ''))) AS normalized_country,
              UPPER(TRIM(COALESCE(home_region_code, ''))) AS normalized_region
       FROM router_profiles_v4 WHERE user_id = $1`,
      [ROUTER_USER_ID],
    );
    if (jurRows.rows.length > 0) {
      const j = jurRows.rows[0] as Record<string, unknown>;
      routerJurisdiction = `${j.normalized_country ?? "?"} / ${j.normalized_region ?? "?"}`;
      log(`normalized_country=${j.normalized_country} normalized_region=${j.normalized_region}\n`);
    } else {
      log("⚠ No router profile for user\n");
    }

    // Section 3
    log("========== Section 3 — Raw BC/CA job universe ==========\n");
    const caBcCount = (await client.query(`
      SELECT COUNT(*) AS ca_bc_jobs FROM jobs
      WHERE country_code = 'CA' AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
    `)).rows[0] as Record<string, unknown>;
    log(`ca_bc_jobs: ${caBcCount?.ca_bc_jobs}\n`);

    // Section 4 — Stage counts
    log("========== Section 4 — Stage-by-stage filter collapse ==========\n");
    stage1 = Number((await client.query(`
      SELECT COUNT(*) AS c FROM jobs WHERE country_code = 'CA'
        AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
    `)).rows[0]?.c ?? 0);
    stage2 = Number((await client.query(`
      SELECT COUNT(*) AS c FROM jobs WHERE country_code = 'CA'
        AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC' AND status = 'OPEN_FOR_ROUTING'
    `)).rows[0]?.c ?? 0);
    stage3 = Number((await client.query(`
      SELECT COUNT(*) AS c FROM jobs WHERE country_code = 'CA'
        AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
        AND status = 'OPEN_FOR_ROUTING' AND routing_status = 'UNROUTED'
    `)).rows[0]?.c ?? 0);
    stage4 = Number((await client.query(`
      SELECT COUNT(*) AS c FROM jobs WHERE country_code = 'CA'
        AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
        AND status = 'OPEN_FOR_ROUTING' AND routing_status = 'UNROUTED' AND contractor_user_id IS NULL
    `)).rows[0]?.c ?? 0);
    stage5 = Number((await client.query(`
      SELECT COUNT(*) AS c FROM jobs WHERE country_code = 'CA'
        AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
        AND status = 'OPEN_FOR_ROUTING' AND routing_status = 'UNROUTED' AND contractor_user_id IS NULL
        AND COALESCE(cancel_request_pending, false) = false
    `)).rows[0]?.c ?? 0);
    stage6 = Number((await client.query(`
      SELECT COUNT(*) AS c FROM jobs WHERE country_code = 'CA'
        AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
        AND status = 'OPEN_FOR_ROUTING' AND routing_status = 'UNROUTED' AND contractor_user_id IS NULL
        AND COALESCE(cancel_request_pending, false) = false AND archived_at IS NULL
    `)).rows[0]?.c ?? 0);

    log(`Stage 1 jurisdiction: ${stage1}`);
    log(`Stage 2 +status: ${stage2}`);
    log(`Stage 3 +routing_status: ${stage3}`);
    log(`Stage 4 +contractor_null: ${stage4}`);
    log(`Stage 5 +cancel_pending: ${stage5}`);
    log(`Stage 6 +archived: ${stage6}\n`);

    // Section 5 — Final rows
    log("========== Section 5 — Rows surviving final stage ==========\n");
    const finalRes = await client.query(`
      SELECT id, title, status, routing_status, contractor_user_id, cancel_request_pending, archived_at,
             country_code, region_code, state_code
      FROM jobs
      WHERE country_code = 'CA' AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
        AND status = 'OPEN_FOR_ROUTING' AND routing_status = 'UNROUTED' AND contractor_user_id IS NULL
        AND COALESCE(cancel_request_pending, false) = false AND archived_at IS NULL
      ORDER BY created_at DESC
    `);
    finalRows = finalRes.rows as Array<Record<string, unknown>>;
    if (finalRows.length === 0) {
      log("(none)\n");
    } else {
      for (const r of finalRows) {
        log(`  ${r.id} | ${String(r.title ?? "").slice(0, 50)} | status=${r.status} routing=${r.routing_status}`);
      }
      log("");
    }

    // Section 9 — Truth query
    log("========== Section 9 — Exact service truth query ==========\n");
    const truthRes = await client.query(`
      SELECT id, title, trade_category, city, country_code, region_code, state_code, status, routing_status,
             contractor_user_id, cancel_request_pending, archived_at, created_at
      FROM jobs
      WHERE status = 'OPEN_FOR_ROUTING' AND routing_status = 'UNROUTED' AND contractor_user_id IS NULL
        AND COALESCE(cancel_request_pending, false) = false AND archived_at IS NULL
        AND country_code = 'CA' AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
      ORDER BY created_at DESC LIMIT 50
    `);
    const truthRows = truthRes.rows as Array<Record<string, unknown>>;
    log(`Truth query returned: ${truthRows.length} rows\n`);
  } catch (err) {
    log(`\n⚠ Error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await client.end();
  }

  // Summary
  log("═══════════════════════════════════════════════════════════════════════");
  log("REQUIRED OUTPUT SUMMARY");
  log("═══════════════════════════════════════════════════════════════════════\n");
  log(`Router user: ${ROUTER_USER_ID}`);
  log(`Router jurisdiction: ${routerJurisdiction}\n`);
  log(`Stage 1 jurisdiction: ${stage1}`);
  log(`Stage 2 status: ${stage2}`);
  log(`Stage 3 routing_status: ${stage3}`);
  log(`Stage 4 contractor null: ${stage4}`);
  log(`Stage 5 cancel pending: ${stage5}`);
  log(`Stage 6 archived: ${stage6}\n`);
  log("Expected visible jobs:");
  if (finalRows.length === 0) {
    log("  (none)");
  } else {
    for (const r of finalRows) log(`  - ${r.id} | ${r.title}`);
  }
  log("");

  let conclusion = "";
  if (stage1 === 0) conclusion = "No jobs in CA/BC jurisdiction. DB may be empty or wrong region.";
  else if (stage2 === 0) conclusion = "Rows disappear at stage 2: no OPEN_FOR_ROUTING jobs.";
  else if (stage3 === 0) conclusion = "Rows disappear at stage 3: no UNROUTED jobs.";
  else if (stage4 === 0) conclusion = "Rows disappear at stage 4: all have contractor_user_id assigned.";
  else if (stage5 === 0) conclusion = "Rows disappear at stage 5: cancel_request_pending = true.";
  else if (stage6 === 0) conclusion = "Rows disappear at stage 6: archived_at is set.";
  else if (finalRows.length > 0)
    conclusion = "Final query returns rows. If API still returns empty → environment/runtime mismatch.";
  else conclusion = "Unexpected: stage 6 > 0 but final rows empty.";

  log("Conclusion:");
  log(`  ${conclusion}`);

  // Write report
  const reportPath = path.join(process.cwd(), "docs/ROUTER_AVAILABLE_JOBS_FORENSIC_REPORT.md");
  const md = [
    "# Router Available Jobs Forensic Report",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    `**Target router:** ${ROUTER_USER_ID} / ${ROUTER_EMAIL}`,
    "",
    "---",
    "",
    "## Summary",
    "",
    `- **Router jurisdiction:** ${routerJurisdiction}`,
    `- **Stage 1 (jurisdiction):** ${stage1}`,
    `- **Stage 2 (+status):** ${stage2}`,
    `- **Stage 3 (+routing_status):** ${stage3}`,
    `- **Stage 4 (+contractor null):** ${stage4}`,
    `- **Stage 5 (+cancel pending):** ${stage5}`,
    `- **Stage 6 (+archived):** ${stage6}`,
    `- **Final visible jobs:** ${finalRows.length}`,
    "",
    "## Expected visible jobs",
    "",
    finalRows.length === 0 ? "(none)" : finalRows.map((r) => `- ${r.id} | ${r.title}`).join("\n"),
    "",
    "## Conclusion",
    "",
    conclusion,
    "",
    "---",
    "",
    "## Full output",
    "",
    "```",
    report.join("\n"),
    "```",
  ].join("\n");

  fs.writeFileSync(reportPath, md, "utf-8");
  console.log(`\nReport written to ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
