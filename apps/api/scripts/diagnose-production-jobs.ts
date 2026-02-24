#!/usr/bin/env tsx
/**
 * Diagnostic: Check if public.jobs exists and has expected columns.
 * Run with production DATABASE_URL to verify schema before/after migration.
 *
 * Usage: DATABASE_URL="<prod_url>" pnpm exec tsx apps/api/scripts/diagnose-production-jobs.ts
 */
import { Client } from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('jobs', 'Job')
       ORDER BY table_name`
    );
    console.log("Tables in public:", tables.rows.map((r) => r.table_name).join(", ") || "(none)");

    const jobsCols = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'jobs'
       ORDER BY ordinal_position`
    );
    if (jobsCols.rows.length) {
      console.log("public.jobs columns:", jobsCols.rows.length);
      const required = ["id", "status", "archived", "router_approved_at", "created_at"];
      const have = new Set(jobsCols.rows.map((r) => r.column_name));
      const missing = required.filter((c) => !have.has(c));
      if (missing.length) console.log("  MISSING required:", missing.join(", "));
      else console.log("  Required columns: OK");
    } else {
      console.log("public.jobs: NOT FOUND");
    }

    const jobLegacy = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'Job'`
    );
    if (jobLegacy.rows.length) console.log("public.\"Job\" (legacy): EXISTS");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
