#!/usr/bin/env tsx
/**
 * Mock Job Audit — PHASE 1.
 * Run: DOTENV_CONFIG_PATH=.env.local pnpm exec tsx scripts/mock-job-audit.ts
 */
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const schema = (() => {
  try {
    const u = new URL(url);
    return u.searchParams.get("schema") || "public";
  } catch {
    return "public";
  }
})();

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`SET search_path TO "${schema}", public`);

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  MOCK JOB AUDIT — PHASE 1");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Total mock jobs
  const totalRes = await client.query(
    `SELECT COUNT(*)::int as cnt FROM jobs WHERE is_mock = true`
  );
  const total = Number(totalRes.rows[0]?.cnt ?? 0);
  console.log("TOTAL MOCK JOBS:", total);

  if (total === 0) {
    console.log("\nNo mock jobs found. Run seed:mock-jobs first.");
    await client.end();
    return;
  }

  // Category distribution
  const catRes = await client.query(`
    SELECT trade_category, COUNT(*)::int as cnt
    FROM jobs WHERE is_mock = true
    GROUP BY trade_category
    ORDER BY cnt DESC
  `);
  console.log("\nCATEGORY DISTRIBUTION:");
  catRes.rows.forEach((r) => console.log(`  ${r.trade_category}: ${r.cnt}`));

  // % with images (via job_photos)
  const withImgRes = await client.query(`
    SELECT COUNT(DISTINCT j.id)::int as cnt
    FROM jobs j
    INNER JOIN job_photos p ON p.job_id = j.id
    WHERE j.is_mock = true
  `);
  const withImages = Number(withImgRes.rows[0]?.cnt ?? 0);
  const pctImages = total > 0 ? ((withImages / total) * 100).toFixed(1) : "0";
  console.log(`\n% WITH IMAGES: ${withImages}/${total} (${pctImages}%)`);

  // Count per image path
  const pathRes = await client.query(`
    SELECT p.url, COUNT(*)::int as cnt
    FROM job_photos p
    INNER JOIN jobs j ON j.id = p.job_id AND j.is_mock = true
    GROUP BY p.url
    ORDER BY cnt DESC
    LIMIT 30
  `);
  console.log("\nIMAGE USAGE (top 30 paths):");
  pathRes.rows.forEach((r) => console.log(`  ${r.url}: ${r.cnt}`));

  // Jobs with $0 pricing
  const zeroLabor = await client.query(`
    SELECT id, title, labor_total_cents, router_earnings_cents, contractor_payout_cents
    FROM jobs WHERE is_mock = true AND labor_total_cents <= 0
    LIMIT 20
  `);
  console.log(`\nJOBS WITH labor_total_cents <= 0: ${zeroLabor.rows.length}`);
  zeroLabor.rows.forEach((r) =>
    console.log(`  ${r.id}: labor=${r.labor_total_cents} router=${r.router_earnings_cents} contractor=${r.contractor_payout_cents}`)
  );

  // Missing router earnings
  const noRouter = await client.query(`
    SELECT COUNT(*)::int FROM jobs WHERE is_mock = true AND (router_earnings_cents IS NULL OR router_earnings_cents < 0)
  `);
  console.log(`\nJOBS MISSING router_earnings_cents: ${noRouter.rows[0]?.count ?? 0}`);

  // Missing contractor payout
  const noContractor = await client.query(`
    SELECT COUNT(*)::int FROM jobs WHERE is_mock = true AND (contractor_payout_cents IS NULL OR contractor_payout_cents <= 0)
  `);
  console.log(`JOBS MISSING contractor_payout_cents: ${noContractor.rows[0]?.count ?? 0}`);

  // Currency distribution
  const currRes = await client.query(`
    SELECT currency, COUNT(*)::int as cnt
    FROM jobs WHERE is_mock = true
    GROUP BY currency
  `);
  console.log("\nCURRENCY DISTRIBUTION:");
  currRes.rows.forEach((r) => console.log(`  ${r.currency}: ${r.cnt}`));

  // Title contains "test"
  const testTitleRes = await client.query(`
    SELECT COUNT(*)::int FROM jobs WHERE is_mock = true AND LOWER(title) LIKE '%test%'
  `);
  console.log(`\nTITLES CONTAINING 'test': ${testTitleRes.rows[0]?.count ?? 0}`);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
