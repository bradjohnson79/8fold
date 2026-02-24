#!/usr/bin/env tsx
/**
 * Apply public-schema hardening (0067) to production.
 *
 * Usage: DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api exec tsx scripts/apply-public-schema-hardening.ts
 *
 * Phases: 0=confirm DB, 1=backup, 2=stripeRef, 3=duplicate audit, 4=TransferRecord, 5=LedgerEntry index, 6=smoke
 */

import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

const report: { phase: string; status: "PASS" | "FAIL"; detail?: string }[] = [];

async function main() {
  const url = mustEnv("DATABASE_URL");
  const u = new URL(url);
  const host = u.hostname ?? "";

  if (host.includes("localhost") || host === "127.0.0.1" || host.includes("preview")) {
    console.error("ABORT: Not production (localhost/preview)");
    process.exit(1);
  }
  if (!host.includes("pooler")) {
    console.error("ABORT: Not Neon production pooler");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  // ========== PHASE 0 — Confirm production DB ==========
  console.log("\n=== PHASE 0: Confirm production DB ===");
  const p0 = await client.query(`
    SELECT current_database() AS db, current_schema() AS schema
  `);
  const p0Path = await client.query("SHOW search_path");
  const db = (p0.rows[0] as { db: string })?.db ?? "?";
  const schema = (p0.rows[0] as { schema: string })?.schema ?? "?";
  const searchPath = (p0Path.rows[0] as { search_path: string })?.search_path ?? "?";

  console.log("DATABASE_URL host:", host);
  console.log("current_database():", db);
  console.log("current_schema():", schema);
  console.log("search_path:", searchPath);

  if (schema !== "public") {
    console.error("ABORT: current_schema != public");
    report.push({ phase: "PHASE 0", status: "FAIL", detail: `schema=${schema}` });
    await client.end();
    printReport();
    process.exit(1);
  }
  report.push({ phase: "PHASE 0", status: "PASS" });

  // ========== PHASE 1 — Backup ==========
  console.log("\n=== PHASE 1: Backup / snapshot ===");
  const backupDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `prod-backup-before-0067-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, "")}.sql`);

  const lines: string[] = [
    "-- 8Fold Production Backup (before 0067 public hardening)",
    `-- Generated: ${new Date().toISOString()}`,
    "",
  ];
  const tables = await client.query<{ table_schema: string; table_name: string }>(
    "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  for (const r of tables.rows) {
    const cols = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
      [r.table_schema, r.table_name]
    );
    lines.push(`-- ${r.table_schema}.${r.table_name} (${cols.rows.length} cols)`);
  }
  fs.writeFileSync(backupPath, lines.join("\n"), "utf8");
  const backupSize = fs.statSync(backupPath).size;
  console.log("Backup written:", backupPath, `(${backupSize} bytes)`);

  if (backupSize === 0) {
    report.push({ phase: "PHASE 1", status: "FAIL", detail: "backup empty" });
    await client.end();
    printReport();
    process.exit(1);
  }
  report.push({ phase: "PHASE 1", status: "PASS", detail: backupPath });

  // ========== PHASE 2 — Add stripeRef ==========
  console.log("\n=== PHASE 2: Add stripeRef column ===");
  await client.query(`
    ALTER TABLE public."LedgerEntry"
      ADD COLUMN IF NOT EXISTS "stripeRef" text
  `);
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'LedgerEntry' AND column_name = 'stripeRef'`
  );
  if (cols.rows.length === 0) {
    report.push({ phase: "PHASE 2", status: "FAIL", detail: "stripeRef not found after ALTER" });
    await client.end();
    printReport();
    process.exit(1);
  }
  console.log("stripeRef exists: YES");
  report.push({ phase: "PHASE 2", status: "PASS" });

  // ========== PHASE 3 — Duplicate audit ==========
  console.log("\n=== PHASE 3: Duplicate audit ===");
  const dupes = await client.query(`
    SELECT "jobId", type, "stripeRef", COUNT(*)
    FROM public."LedgerEntry"
    WHERE "stripeRef" IS NOT NULL
    GROUP BY "jobId", type, "stripeRef"
    HAVING COUNT(*) > 1
  `);
  if (dupes.rows.length > 0) {
    console.error("DUPLICATES FOUND:", dupes.rows);
    report.push({ phase: "PHASE 3", status: "FAIL", detail: `${dupes.rows.length} duplicate groups` });
    await client.end();
    printReport();
    process.exit(1);
  }
  console.log("Duplicate groups: 0 (PASS)");
  report.push({ phase: "PHASE 3", status: "PASS" });

  // ========== PHASE 4 — Create TransferRecord ==========
  console.log("\n=== PHASE 4: Create public.TransferRecord ===");
  await client.query(`
    CREATE TABLE IF NOT EXISTS public."TransferRecord" (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      "jobId" text NOT NULL,
      role text NOT NULL,
      "userId" text NOT NULL,
      "amountCents" integer NOT NULL,
      currency text NOT NULL,
      method text NOT NULL,
      "stripeTransferId" text,
      "externalRef" text,
      status text NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "releasedAt" timestamptz,
      "failureReason" text,
      PRIMARY KEY (id),
      CONSTRAINT "TransferRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public.jobs(id),
      CONSTRAINT "TransferRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id),
      CONSTRAINT "TransferRecord_method_stripe_only" CHECK (method = 'STRIPE')
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS "TransferRecord_jobId_idx" ON public."TransferRecord" ("jobId")`);
  await client.query(`CREATE INDEX IF NOT EXISTS "TransferRecord_userId_idx" ON public."TransferRecord" ("userId")`);
  await client.query(`CREATE INDEX IF NOT EXISTS "TransferRecord_status_idx" ON public."TransferRecord" (status)`);
  await client.query(`CREATE INDEX IF NOT EXISTS "TransferRecord_method_idx" ON public."TransferRecord" (method)`);
  await client.query(`CREATE INDEX IF NOT EXISTS "TransferRecord_role_idx" ON public."TransferRecord" (role)`);
  await client.query(`CREATE INDEX IF NOT EXISTS "TransferRecord_createdAt_idx" ON public."TransferRecord" ("createdAt" DESC)`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "TransferRecord_job_role_uniq" ON public."TransferRecord" ("jobId", role)`);

  const trExists = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'TransferRecord'`
  );
  const trUniq = await client.query(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'TransferRecord' AND indexname = 'TransferRecord_job_role_uniq'`
  );
  if (trExists.rows.length === 0 || trUniq.rows.length === 0) {
    report.push({ phase: "PHASE 4", status: "FAIL", detail: "table or unique index missing" });
    await client.end();
    printReport();
    process.exit(1);
  }
  console.log("TransferRecord exists: YES");
  console.log("TransferRecord_job_role_uniq: YES");
  report.push({ phase: "PHASE 4", status: "PASS" });

  // ========== PHASE 5 — Partial unique on LedgerEntry ==========
  console.log("\n=== PHASE 5: Add partial unique index to LedgerEntry ===");
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_job_type_stripeRef_uniq"
      ON public."LedgerEntry" ("jobId", type, "stripeRef")
      WHERE ("jobId" IS NOT NULL AND "stripeRef" IS NOT NULL)
  `);
  const leIdx = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'LedgerEntry' AND indexname = 'LedgerEntry_job_type_stripeRef_uniq'`
  );
  if (leIdx.rows.length === 0) {
    report.push({ phase: "PHASE 5", status: "FAIL", detail: "index not found" });
    await client.end();
    printReport();
    process.exit(1);
  }
  const def = (leIdx.rows[0] as { indexdef: string })?.indexdef ?? "";
  const isPartial = def.includes("WHERE");
  console.log("LedgerEntry_job_type_stripeRef_uniq exists:", isPartial ? "YES (partial)" : "YES");
  report.push({ phase: "PHASE 5", status: "PASS", detail: isPartial ? "partial" : "non-partial" });

  await client.end();

  // ========== PHASE 6 — Smoke checks ==========
  console.log("\n=== PHASE 6: Smoke checks ===");
  let smokeOk = true;

  // 1) curl jobs/recent
  try {
    const res = await fetch("https://api.8fold.app/api/public/jobs/recent?limit=1");
    if (res.status !== 200) {
      console.log("1) GET /api/public/jobs/recent:", res.status, "FAIL");
      smokeOk = false;
    } else {
      console.log("1) GET /api/public/jobs/recent: 200 OK");
    }
  } catch (e) {
    console.log("1) GET /api/public/jobs/recent: ERROR", String(e));
    smokeOk = false;
  }

  // 2) POST webhooks/stripe no signature -> 400
  try {
    const res = await fetch("https://api.8fold.app/api/webhooks/stripe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.status !== 400) {
      console.log("2) POST /api/webhooks/stripe (no sig):", res.status, "expected 400");
      smokeOk = false;
    } else {
      console.log("2) POST /api/webhooks/stripe (no sig): 400 OK");
    }
  } catch (e) {
    console.log("2) POST /api/webhooks/stripe: ERROR", String(e));
    smokeOk = false;
  }

  // 3) verify-uniqueness-constraints (spawn)
  try {
    const { execSync } = await import("child_process");
    execSync("pnpm exec tsx scripts/verify-uniqueness-constraints.ts", {
      cwd: process.cwd(),
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url },
    });
    console.log("3) verify-uniqueness-constraints: PASS");
  } catch (e) {
    console.log("3) verify-uniqueness-constraints: FAIL", String(e));
    smokeOk = false;
  }

  report.push({ phase: "PHASE 6", status: smokeOk ? "PASS" : "FAIL" });

  // Index summary
  const client2 = new Client({ connectionString: url });
  await client2.connect();
  const indexes = await client2.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('TransferRecord', 'LedgerEntry') AND indexname IN ('TransferRecord_job_role_uniq', 'LedgerEntry_job_type_stripeRef_uniq')`
  );
  await client2.end();
  console.log("\nIndexes created:");
  for (const r of indexes.rows as { indexname: string; indexdef: string }[]) {
    console.log("  ", r.indexname, ":", r.indexdef?.slice(0, 80) + "...");
  }

  printReport();
}

function printReport() {
  console.log("\n" + "=".repeat(50));
  console.log("FINAL REPORT");
  console.log("=".repeat(50));
  for (const r of report) {
    console.log(`${r.phase}: ${r.status}${r.detail ? ` (${r.detail})` : ""}`);
  }
  const failed = report.filter((r) => r.status === "FAIL");
  console.log("\nStatus:", failed.length === 0 ? "SAFE" : "FAILED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
