/**
 * Post-deploy validation: Router Available Jobs pipeline and contractor discovery.
 * Run: pnpm exec tsx scripts/validate-router-pipeline.ts
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

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();

  const schema = getSchema(url);
  if (schema) {
    await client.query(`set search_path to "${schema}", public`);
  }

  let failed = false;

  // Step 1 — Available Jobs query
  console.log("1. Available Jobs sample");
  const jobsRes = await client.query(`
    SELECT id, title, country_code, region_code, contractor_user_id, routing_status
    FROM jobs
    WHERE status = 'OPEN_FOR_ROUTING'
    AND archived_at IS NULL
    LIMIT 10
  `);
  if (jobsRes.rows.length > 0) {
    const bad = jobsRes.rows.filter(
      (r: any) => r.contractor_user_id != null || !r.country_code || !r.region_code
    );
    if (bad.length > 0) {
      console.log("   ✗ Some jobs have contractor_user_id set or missing codes:", bad.length);
      failed = true;
    } else {
      console.log("   ✓", jobsRes.rows.length, "jobs returned, contractor_user_id NULL, codes populated");
    }
  } else {
    console.log("   ✓ No OPEN_FOR_ROUTING jobs (empty is ok)");
  }

  // Step 1b — Routing lifecycle (OPEN_FOR_ROUTING jobs should have UNROUTED or INVITES_SENT/ROUTED_BY_ROUTER)
  console.log("\n1b. Routing status for OPEN_FOR_ROUTING jobs");
  const routingRes = await client.query(`
    SELECT id, routing_status
    FROM jobs
    WHERE status = 'OPEN_FOR_ROUTING'
    AND archived_at IS NULL
    LIMIT 10
  `);
  if (routingRes.rows.length > 0) {
    const validStatuses = ["UNROUTED", "INVITES_SENT", "ROUTED_BY_ROUTER"];
    const invalid = routingRes.rows.filter((r: any) => !validStatuses.includes(r.routing_status ?? ""));
    if (invalid.length > 0) {
      console.log("   ⚠ Unexpected routing_status:", invalid.map((r: any) => r.routing_status));
    } else {
      console.log("   ✓ routing_status values:", [...new Set(routingRes.rows.map((r: any) => r.routing_status))].join(", "));
    }
  } else {
    console.log("   ✓ No OPEN_FOR_ROUTING jobs (empty is ok)");
  }

  // Step 1c — Jobs that should have been reset (INVITES_SENT/ROUTED_BY_ROUTER with all invites expired, contractor_user_id NULL)
  console.log("\n1c. Stale invites-sent jobs (should be reset)");
  const staleRes = await client.query(`
    SELECT j.id, j.routing_status
    FROM jobs j
    WHERE j.routing_status IN ('INVITES_SENT', 'ROUTED_BY_ROUTER')
    AND j.contractor_user_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM v4_contractor_job_invites i
      WHERE i.job_id = j.id AND i.status = 'PENDING' AND i.expires_at > now()
    )
    LIMIT 5
  `);
  if (staleRes.rows.length > 0) {
    console.log("   ⚠ Jobs with expired invites not yet reset:", staleRes.rows.length, "(worker will reset on next run)");
  } else {
    console.log("   ✓ No stale invites-sent jobs");
  }

  // Step 2 — Router jurisdiction
  console.log("\n2. Router profile");
  const routerRes = await client.query(`
    SELECT user_id, home_country_code, home_region_code
    FROM router_profiles_v4
    LIMIT 1
  `);
  if (routerRes.rows.length === 0) {
    console.log("   ⚠ No router profile (skip jurisdiction checks)");
  } else {
    const r = routerRes.rows[0] as any;
    if (!r.home_country_code || !r.home_region_code) {
      console.log("   ✗ Router profile missing home_country_code or home_region_code");
      failed = true;
    } else {
      console.log("   ✓ Router profile found:", r.home_country_code, r.home_region_code);
    }
  }

  // Step 3 — Contractor jurisdiction filter
  if (routerRes.rows.length > 0) {
    const r = routerRes.rows[0] as any;
    console.log("\n3. Contractors in jurisdiction");
    const contractorsRes = await client.query(
      `SELECT user_id, country_code, home_region_code
       FROM contractor_profiles_v4
       WHERE upper(trim(coalesce(country_code, ''))) = $1
       AND upper(trim(coalesce(home_region_code, ''))) = $2
       LIMIT 10`,
      [String(r.home_country_code ?? "").toUpperCase(), String(r.home_region_code ?? "").toUpperCase()]
    );
    console.log("   ✓ Contractors in jurisdiction:", contractorsRes.rows.length);
  } else {
    console.log("\n3. Contractors in jurisdiction — skipped (no router)");
  }

  // Step 4 — Bounding box (contractor coords)
  console.log("\n4. Contractor coordinates");
  const bboxRes = await client.query(`
    SELECT user_id, home_latitude, home_longitude
    FROM contractor_profiles_v4
    WHERE home_latitude IS NOT NULL
    AND home_longitude IS NOT NULL
    LIMIT 10
  `);
  if (bboxRes.rows.length > 0) {
    console.log("   ✓ Contractors with coordinates:", bboxRes.rows.length);
  } else {
    console.log("   ⚠ No contractors with coordinates (bbox filtering not possible)");
  }

  // Step 5 — Invite pipeline
  console.log("\n5. Routing invites");
  const invitesRes = await client.query(`
    SELECT job_id, contractor_user_id, route_id, status
    FROM v4_contractor_job_invites
    ORDER BY created_at DESC
    LIMIT 5
  `);
  if (invitesRes.rows.length > 0) {
    const bad = invitesRes.rows.filter((r: any) => !r.route_id || !r.status);
    if (bad.length > 0) {
      console.log("   ✗ Some invites missing route_id or status");
      failed = true;
    } else {
      console.log("   ✓ Invites recorded, route_id populated, status present");
    }
  } else {
    console.log("   ✓ No invites yet (empty is ok)");
  }

  // Step 6 — Duplicate check
  console.log("\n6. Duplicate invites");
  const dupRes = await client.query(`
    SELECT job_id, contractor_user_id, COUNT(*)
    FROM v4_contractor_job_invites
    GROUP BY job_id, contractor_user_id
    HAVING COUNT(*) > 1
  `);
  if (dupRes.rows.length > 0) {
    console.log("   ✗ Duplicate invites detected:", dupRes.rows);
    failed = true;
  } else {
    console.log("   ✓ No duplicate invites");
  }

  // Step 7 — Invite cap per job
  console.log("\n7. Invite cap per job (max 5)");
  const capRes = await client.query(`
    SELECT job_id, COUNT(*) AS cnt
    FROM v4_contractor_job_invites
    GROUP BY job_id
    HAVING COUNT(*) > 5
  `);
  if (capRes.rows.length > 0) {
    console.log("   ✗ Jobs with >5 invites:", capRes.rows);
    failed = true;
  } else {
    console.log("   ✓ No job has >5 invites");
  }

  // Step 8 — Rewards audit (optional)
  console.log("\n8. Reward balance audit (optional)");
  const rewardAuditRes = await client.query(`
    SELECT
      re.router_user_id,
      SUM(re.amount_cents)::bigint AS ledger_total,
      rp.rewards_balance_cents AS balance
    FROM v4_router_reward_events re
    JOIN router_profiles_v4 rp ON rp.user_id = re.router_user_id
    GROUP BY re.router_user_id, rp.rewards_balance_cents
    LIMIT 10
  `);
  if (rewardAuditRes.rows.length > 0) {
    const mismatches = rewardAuditRes.rows.filter(
      (r: any) => Number(r.ledger_total ?? 0) !== Number(r.balance ?? 0)
    );
    if (mismatches.length > 0) {
      console.log("   ⚠ Ledger/balance mismatch for:", mismatches.length, "routers");
    } else {
      console.log("   ✓ Reward balances consistent");
    }
  } else {
    console.log("   ✓ No reward events (empty is ok)");
  }

  await client.end();

  if (failed) {
    console.log("\n✗ Validation failed");
    process.exit(1);
  }
  console.log("\n✓ Pipeline validation complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
