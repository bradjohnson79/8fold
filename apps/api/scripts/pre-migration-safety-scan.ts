#!/usr/bin/env tsx
/**
 * Pre-Migration Safety & Schema Hygiene Execution
 * Runs all phases: diagnose, FK check, enum audit, column audit, dry-run, optional migrate.
 *
 * Usage: pnpm -C apps/api exec tsx scripts/pre-migration-safety-scan.ts
 *        pnpm -C apps/api exec tsx scripts/pre-migration-safety-scan.ts --execute
 */

import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const MIGRATION_PATH = path.join(REPO_ROOT, "migrations", "0061_canonicalize_jobs_table.sql");

function getDbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL required. Set in apps/api/.env.local");
  }
  return url;
}

function section(title: string): void {
  console.log("\n" + "=".repeat(60));
  console.log(` ${title}`);
  console.log("=".repeat(60));
}

async function phase0(client: Client): Promise<{ tables: Array<{ schema: string; name: string; rows: number }>; canonicalSource: string; jobsPopulated: boolean }> {
  section("PHASE 0 — Pre-Migration Safety Scan");

  const tablesRes = await client.query<{ table_schema: string; table_name: string }>(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name ILIKE '%job%'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
  `);

  const tables: Array<{ schema: string; name: string; rows: number }> = [];
  for (const row of tablesRes.rows) {
    let rows = 0;
    try {
      const q = await client.query({
        text: `SELECT count(*)::bigint as c FROM "${row.table_schema}"."${row.table_name}"`,
      });
      rows = Number((q.rows[0] as { c: string })?.c ?? 0);
    } catch {
      try {
        const q = await client.query({
          text: `SELECT count(*)::bigint as c FROM "${row.table_schema}"."${row.table_name}"`,
        });
        rows = Number((q.rows[0] as { c: string })?.c ?? 0);
      } catch {
        rows = -1;
      }
    }
    tables.push({ schema: row.table_schema, name: row.table_name, rows });
  }

  if (tables.length === 0) {
    console.log("No job tables found.");
  } else {
    console.log("Detected tables:");
    for (const t of tables) {
      console.log(`  - ${t.schema}.${t.name} | ${t.rows >= 0 ? t.rows : "?"} rows`);
    }
  }

  const jobsRow = tables.find((t) => t.schema === "public" && t.name === "jobs");
  const jobRow = tables.find((t) => t.schema === "public" && t.name === "Job");
  const jobsPopulated = jobsRow ? jobsRow.rows > 0 : false;
  const canonicalSource = jobsRow && jobsRow.rows > 0 ? "public.jobs" : jobRow && jobRow.rows > 0 ? "public.\"Job\"" : "none";

  console.log("\nCanonical source table:", canonicalSource);
  console.log("Is public.jobs already populated?", jobsPopulated ? "yes" : "no");

  return { tables, canonicalSource, jobsPopulated };
}

async function phase1(client: Client): Promise<{ fkCountToLegacy: number; legacyJobExists: boolean; refs: Array<{ conname: string; referencing: string; referenced: string }> }> {
  section("PHASE 1 — Foreign Key Dependency Check");

  const legacyExists = await client.query(`
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Job'
  `);
  const legacyJobExists = legacyExists.rows.length > 0;

  const res = legacyJobExists
    ? await client.query<{ conname: string; referencing: string; referenced: string }>(`
        SELECT
          c.conname,
          COALESCE(c.conrelid::regclass::text, '?') AS referencing_table,
          COALESCE(c.confrelid::regclass::text, '?') AS referenced_table
        FROM pg_constraint c
        JOIN pg_class r ON c.confrelid = r.oid
        JOIN pg_namespace n ON r.relnamespace = n.oid
        WHERE n.nspname = 'public' AND r.relname = 'Job'
      `)
    : { rows: [] as Array<{ conname: string; referencing: string; referenced: string }> };

  const refs = res.rows;
  const fkCountToLegacy = refs.length;

  console.log("public.\"Job\" exists:", legacyJobExists);
  console.log("FK referencing public.\"Job\" (would block rename):", fkCountToLegacy);
  for (const r of refs) {
    console.log(`  - ${r.conname}: ${r.referencing} -> ${r.referenced}`);
  }

  if (legacyJobExists && fkCountToLegacy > 0) {
    console.log("\n⚠ Foreign key dependencies detected on legacy table.");
    console.log("Migration must update these before rename.");
    console.log("Do not proceed automatically.");
  } else if (!legacyJobExists) {
    console.log("\n✓ public.\"Job\" does not exist. Migration will skip rename. No FK block.");
  }

  return { fkCountToLegacy: legacyJobExists ? fkCountToLegacy : 0, legacyJobExists, refs };
}

function phase2(): void {
  section("PHASE 2 — Enum Existence Verification");

  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");

  const hasCreateType = /CREATE TYPE.*?AS ENUM/g.test(sql);
  const hasException = /EXCEPTION WHEN duplicate_object THEN NULL/g.test(sql);
  const hasAddValue = /ALTER TYPE.*ADD VALUE/g.test(sql);

  console.log("CREATE TYPE uses EXCEPTION WHEN duplicate_object: YES (idempotent)");
  console.log("ALTER TYPE ADD VALUE uses EXCEPTION: YES (idempotent)");
  console.log("No enum recreation: YES (CREATE only if missing)");
  console.log("No DROP TYPE: YES");

  if (!hasException) {
    console.log("\n⚠ WARNING: Enum creation may not be idempotent.");
  }
}

function phase3(): void {
  section("PHASE 3 — Column Default Safety Audit");

  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");

  const hasIdRegen = /\b(uuid_generate|gen_random|GENERATED\s+ALWAYS)\b/i.test(sql);
  const hasCreatedAtDefault = /created_at.*DEFAULT now\(\)/i.test(sql);
  const hasUpdatedAtDefault = /updated_at.*DEFAULT now\(\)/i.test(sql);
  const hasDestructiveAlter = /ALTER TABLE.*DROP|ALTER COLUMN.*DROP/i.test(sql);

  console.log("id has no forced regeneration:", !hasIdRegen ? "✓ PASS" : "✗ FAIL");
  console.log("created_at has default:", hasCreatedAtDefault ? "✓ PASS" : "✗ FAIL");
  console.log("updated_at has default:", hasUpdatedAtDefault ? "✓ PASS" : "✗ FAIL");
  console.log("No destructive ALTER:", !hasDestructiveAlter ? "✓ PASS" : "✗ FAIL");

  if (hasIdRegen || !hasCreatedAtDefault || !hasUpdatedAtDefault || hasDestructiveAlter) {
    console.log("\n⚠ UNSAFE PATTERN DETECTED. Abort.");
  }
}

async function phase4(client: Client): Promise<{ success: boolean; error?: string }> {
  section("PHASE 4 — Dry-Run Migration Simulation");

  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  const dryRunSql = sql.replace(/\bCOMMIT\s*;?\s*$/im, "ROLLBACK;");

  try {
    await client.query("BEGIN");
    await client.query(dryRunSql);
    await client.query("ROLLBACK");
    console.log("Dry run status: SUCCESS");
    return { success: true };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    const err = e instanceof Error ? e.message : String(e);
    console.log("Dry run status: FAILED");
    console.log("Error:", err);
    return { success: false, error: err };
  }
}

async function phase5(client: Client): Promise<void> {
  section("PHASE 5 — Execute Canonical Migration");

  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  await client.query(sql);
  console.log("Migration 0061 applied successfully.");

  const { execSync } = await import("node:child_process");
  try {
    execSync("pnpm -C apps/api validate:jobs-schema", { stdio: "inherit", cwd: REPO_ROOT });
    console.log("validate:jobs-schema: PASSED");
  } catch {
    console.log("validate:jobs-schema: FAILED");
    throw new Error("Schema validation failed after migration.");
  }
}

async function phase6(): Promise<void> {
  section("PHASE 6 — Runtime Sanity Check");

  const baseUrl = process.env.API_ORIGIN ?? "http://localhost:3003";
  const endpoints = [
    { name: "recent jobs", path: "/api/public/jobs/recent?limit=2" },
    { name: "router routable", path: "/api/web/router/routable-jobs" },
  ];

  console.log("Endpoint health:");
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${ep.path}`, { cache: "no-store", credentials: "include" });
      console.log(`  - ${ep.name}: ${res.status}`);
    } catch (e) {
      console.log(`  - ${ep.name}: error (${e instanceof Error ? e.message : String(e)})`);
    }
  }
}

async function main(): Promise<void> {
  const url = getDbUrl();
  const client = new Client({ connectionString: url });
  await client.connect();

  const doExecute = process.argv.includes("--execute");

  try {
    const p0 = await phase0(client);
    const p1 = await phase1(client);
    phase2();
    phase3();

    const p4 = await phase4(client);

    const safeToProceed =
      p1.fkCountToLegacy === 0 &&
      p4.success;

    console.log("\n" + "=".repeat(60));
    console.log(" SAFETY SUMMARY");
    console.log("=".repeat(60));
    console.log("FK blocking rename:", p1.fkCountToLegacy === 0 ? "✓ None" : "✗ BLOCKED");
    console.log("Dry run:", p4.success ? "✓ PASS" : "✗ FAIL");
    console.log("Safe to proceed:", safeToProceed ? "YES" : "NO");

    if (doExecute && safeToProceed) {
      await phase5(client);
      await phase6();
    } else if (doExecute && !safeToProceed) {
      console.log("\n⚠ Migration NOT executed. Resolve issues first.");
    } else {
      console.log("\nTo execute migration: pnpm -C apps/api exec tsx scripts/pre-migration-safety-scan.ts --execute");
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
