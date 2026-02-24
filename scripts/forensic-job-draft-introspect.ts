#!/usr/bin/env npx ts-node
/**
 * Forensic Job Draft DB Introspection
 *
 * Run against production DATABASE_URL to verify:
 * - Table existence (job_draft vs JobDraft)
 * - Column definitions for both
 * - Enum values
 * - Duplicate ACTIVE drafts
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx ts-node scripts/forensic-job-draft-introspect.ts
 *   cd apps/api && pnpm exec ts-node ../../scripts/forensic-job-draft-introspect.ts
 */
import path from "path";
import { config } from "dotenv";
import { Client } from "pg";

async function main() {
  const repoRoot = path.resolve(__dirname, "..");
  config({ path: path.join(repoRoot, "apps/api/.env.local") });
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  const schema = (() => {
    try {
      const u = new URL(url);
      return u.searchParams.get("schema") || "public";
    } catch {
      return "public";
    }
  })();

  await client.query(`SET search_path TO "${schema}", public`);

  console.log("=== 1. Table existence (ILIKE '%draft%') ===\n");
  const tables = await client.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1 AND table_name ILIKE '%draft%'
    ORDER BY table_name
  `, [schema]);
  console.log(tables.rows.map((r) => r.table_name).join(", ") || "(none)");

  console.log("\n=== 2. JobDraft columns ===\n");
  const jobDraftCols = await client.query<{ column_name: string; data_type: string; column_default: string | null }>(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = 'JobDraft'
    ORDER BY ordinal_position
  `, [schema]);
  if (jobDraftCols.rows.length === 0) {
    console.log("TABLE NOT FOUND: JobDraft");
  } else {
    console.table(jobDraftCols.rows);
  }

  console.log("\n=== 3. job_draft columns (if exists) ===\n");
  const jobDraftSnake = await client.query<{ column_name: string; data_type: string }>(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = 'job_draft'
    ORDER BY ordinal_position
  `, [schema]);
  if (jobDraftSnake.rows.length === 0) {
    console.log("TABLE NOT FOUND: job_draft (expected — production uses JobDraft)");
  } else {
    console.table(jobDraftSnake.rows);
  }

  console.log("\n=== 4. JobDraftStatus enum ===\n");
  const statusEnum = await client.query<{ enumlabel: string }>(`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = $1 AND t.typname = 'JobDraftStatus'
    ORDER BY e.enumsortorder
  `, [schema]);
  console.log(statusEnum.rows.map((r) => r.enumlabel).join(", "));

  console.log("\n=== 5. JobDraftStep enum ===\n");
  const stepEnum = await client.query<{ enumlabel: string }>(`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = $1 AND t.typname = 'JobDraftStep'
    ORDER BY e.enumsortorder
  `, [schema]);
  console.log(stepEnum.rows.map((r) => r.enumlabel).join(", "));

  console.log("\n=== 6. Duplicate ACTIVE drafts per user ===\n");
  const dupes = await client.query<{ userId: string; count: string }>(`
    SELECT "userId", COUNT(*)::text as count
    FROM "JobDraft"
    WHERE status = 'ACTIVE'
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  `);
  if (dupes.rows.length === 0) {
    console.log("None (safe to add unique index)");
  } else {
    console.table(dupes.rows);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
