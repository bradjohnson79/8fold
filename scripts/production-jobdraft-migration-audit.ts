/**
 * Production JobDraft Migration Audit
 * Run: DATABASE_URL="<production>" pnpm exec tsx scripts/production-jobdraft-migration-audit.ts [--apply]
 *
 * Without --apply: preflight only
 * With --apply: preflight + migration + post-verification
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "apps/api", ".env.local") });

const APPLY = process.argv.includes("--apply");

const report: {
  preflight_ok: boolean;
  backup_confirmed: boolean;
  migration_applied: boolean;
  enum_updated: boolean;
  columns_present: boolean;
  null_userId_rows: number;
  functional_test_passed: boolean;
  errors: string[];
} = {
  preflight_ok: false,
  backup_confirmed: false,
  migration_applied: false,
  enum_updated: false,
  columns_present: false,
  null_userId_rows: -1,
  functional_test_passed: false,
  errors: [],
};

function err(msg: string) {
  report.errors.push(msg);
  console.error(`❌ ${msg}`);
}

function ok(msg: string) {
  console.log(`✅ ${msg}`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    err("DATABASE_URL required");
    console.log("\n--- FINAL REPORT ---");
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  console.log("\n=== STEP 1 — Preflight Audit (Production) ===\n");

  try {
    // Current schema
    const schemaRes = await client.query("SELECT current_schema() as s");
    const currentSchema = schemaRes.rows[0]?.s ?? "?";
    console.log("Current schema:", currentSchema);

    // JobDraft table structure (equivalent to \d "JobDraft")
    const colsRes = await client.query(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'JobDraft'
      AND table_schema = current_schema()
      ORDER BY ordinal_position
    `);
    console.log("\nJobDraft columns:");
    if (colsRes.rows.length === 0) {
      err("JobDraft table not found in current schema");
    } else {
      for (const r of colsRes.rows) {
        console.log(`  ${r.column_name}: ${r.data_type} (udt: ${r.udt_name}) nullable=${r.is_nullable}`);
      }
    }

    // Enum values
    const enumRes = await client.query(`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE t.typname = 'JobDraftStatus' AND n.nspname = current_schema()
      ORDER BY e.enumsortorder
    `);
    console.log("\nJobDraftStatus enum values:");
    const enumLabels = enumRes.rows.map((r) => r.enumlabel);
    console.log("  ", enumLabels.join(", "));
    const hasActive = enumLabels.includes("ACTIVE");
    const hasArchived = enumLabels.includes("ARCHIVED");
    if (!hasActive) err("ACTIVE not in JobDraftStatus");
    if (!hasArchived) err("ARCHIVED not in JobDraftStatus");

    // Row counts by status
    const countRes = await client.query(`
      SELECT status::text as status, COUNT(*)::int as cnt
      FROM "JobDraft"
      GROUP BY status
    `);
    console.log("\nJobDraft rows by status:");
    for (const r of countRes.rows) {
      console.log(`  ${r.status}: ${r.cnt}`);
    }

    report.preflight_ok = report.errors.length === 0;
  } catch (e) {
    err(String(e instanceof Error ? e.message : e));
    report.preflight_ok = false;
  }

  if (!report.preflight_ok) {
    console.log("\n--- Preflight failed. Stopping. ---");
    await client.end();
    console.log("\n--- FINAL REPORT ---");
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  ok("Preflight passed");

  // STEP 2 — Backup confirmation
  console.log("\n=== STEP 2 — Safety Snapshot ===\n");
  if (!APPLY) {
    console.log("Run with --apply to execute migration.");
    console.log("Before applying, confirm:");
    console.log("  - Neon: Create branch snapshot, OR");
    console.log("  - Other: DB backup exists within last 24 hours");
    console.log("\nSet backup_confirmed in report after manual verification.");
    await client.end();
    console.log("\n--- FINAL REPORT ---");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const backupConfirmed = process.env.BACKUP_CONFIRMED === "true";
  if (!backupConfirmed) {
    err("BACKUP_CONFIRMED=true not set. Set it to proceed: BACKUP_CONFIRMED=true DATABASE_URL=... pnpm exec tsx scripts/production-jobdraft-migration-audit.ts --apply");
    report.backup_confirmed = false;
    await client.end();
    console.log("\n--- FINAL REPORT ---");
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.backup_confirmed = true;
  ok("Backup confirmed");

  // STEP 3 — Apply migration
  console.log("\n=== STEP 3 — Apply Migration ===\n");
  const { execSync } = await import("node:child_process");
  try {
    execSync("pnpm db:migrate", {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: url },
      cwd: path.join(__dirname, ".."),
    });
    report.migration_applied = true;
    ok("Migration applied");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    err(`Migration failed: ${msg}`);
    report.migration_applied = false;
    await client.end();
    console.log("\n--- FINAL REPORT ---");
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // STEP 4 — Post-migration verification
  console.log("\n=== STEP 4 — Post-Migration Verification ===\n");

  const enumRes2 = await client.query(`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'JobDraftStatus' AND n.nspname = current_schema()
    ORDER BY e.enumsortorder
  `);
  const labels = enumRes2.rows.map((r) => r.enumlabel);
  const activeOk = labels.includes("ACTIVE");
  const archivedOk = labels.includes("ARCHIVED");
  report.enum_updated = activeOk && archivedOk;
  if (activeOk) ok("ACTIVE exists");
  else err("ACTIVE missing");
  if (archivedOk) ok("ARCHIVED exists");
  else err("ARCHIVED missing");

  const colsRes2 = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'JobDraft' AND table_schema = current_schema()
  `);
  const colNames = colsRes2.rows.map((r) => r.column_name);
  const hasUserId = colNames.includes("userId");
  const hasStep = colNames.includes("step");
  const hasData = colNames.includes("data");
  report.columns_present = hasUserId && hasStep && hasData;
  if (hasUserId) ok("userId column exists");
  else err("userId missing");
  if (hasStep) ok("step column exists");
  else err("step missing");
  if (hasData) ok("data column exists");
  else err("data missing");

  const nullRes = await client.query(`SELECT COUNT(*)::int as n FROM "JobDraft" WHERE "userId" IS NULL`);
  report.null_userId_rows = nullRes.rows[0]?.n ?? -1;
  if (report.null_userId_rows === 0) ok(`null userId rows: ${report.null_userId_rows}`);
  else err(`null userId rows: ${report.null_userId_rows}`);

  await client.end();

  // STEP 5 — Functional verification (optional, requires API base URL)
  console.log("\n=== STEP 5 — Functional Verification ===\n");
  const apiBase = process.env.API_BASE_URL ?? process.env.API_ORIGIN;
  if (apiBase) {
    try {
      const res = await fetch(`${apiBase}/api/job-draft`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const okStatus = res.status >= 200 && res.status < 500;
      if (okStatus) {
        const json = await res.json().catch(() => ({}));
        if (json.success && json.draft?.status === "ACTIVE") {
          report.functional_test_passed = true;
          ok("Functional test passed (GET /api/job-draft, draft.status=ACTIVE)");
        } else {
          err(`Functional test: unexpected response ${JSON.stringify(json)}`);
        }
      } else {
        err(`Functional test: status ${res.status}`);
      }
    } catch (e) {
      err(`Functional test failed: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    console.log("API_BASE_URL not set — skipping functional test");
    console.log("Set API_BASE_URL to verify POST/GET /api/job-draft");
  }

  console.log("\n--- FINAL REPORT ---");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  report.errors.push(String(e));
  console.log("\n--- FINAL REPORT ---");
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
});
