#!/usr/bin/env npx ts-node
/**
 * Introspect JobDraft table on production DB.
 * Run: DATABASE_URL="postgres://..." npx ts-node scripts/introspect-job-draft-production.ts
 * Or: cd apps/api && pnpm exec ts-node ../../scripts/introspect-job-draft-production.ts
 * (loads .env.local from apps/api)
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

  console.log("=== JobDraft table structure (\\d equivalent) ===\n");
  const desc = await client.query(`
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = 'JobDraft'
    ORDER BY ordinal_position
  `, [schema]);
  console.table(desc.rows);

  console.log("\n=== JobDraftStatus enum values ===\n");
  const statusEnum = await client.query(`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = $1 AND t.typname = 'JobDraftStatus'
    ORDER BY e.enumsortorder
  `, [schema]);
  console.log(statusEnum.rows.map((r) => r.enumlabel).join(", "));

  console.log("\n=== JobDraftStep enum values ===\n");
  const stepEnum = await client.query(`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = $1 AND t.typname = 'JobDraftStep'
    ORDER BY e.enumsortorder
  `, [schema]);
  console.log(stepEnum.rows.map((r) => r.enumlabel).join(", "));

  console.log("\n=== Duplicate ACTIVE drafts per user ===\n");
  const dupes = await client.query(`
    SELECT "userId", COUNT(*) as cnt
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

  console.log("\n=== Indexes on JobDraft ===\n");
  const idx = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = $1 AND tablename = 'JobDraft'
  `, [schema]);
  idx.rows.forEach((r) => console.log(r.indexname, "\n", r.indexdef, "\n"));

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
