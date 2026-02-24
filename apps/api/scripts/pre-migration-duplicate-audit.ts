#!/usr/bin/env tsx
/**
 * Production Pre-Migration Duplicate Audit (READ-ONLY)
 *
 * Detects existing duplicates that would violate:
 * - 0065: AdminAdjustmentIdempotency (new table, no existing data)
 * - 0066: TransferRecord UNIQUE(jobId, role), LedgerEntry UNIQUE(jobId, type, stripeRef)
 *
 * DO NOT mutate data. DO NOT apply migrations.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api exec tsx scripts/pre-migration-duplicate-audit.ts
 *
 * Requires: DATABASE_URL (production)
 */

import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname ?? "?";
    const path = u.pathname?.replace(/\/.*$/, "") || "?";
    return `${host} / ${path}`;
  } catch {
    return "(invalid)";
  }
}

function schemaFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

async function main() {
  const url = mustEnv("DATABASE_URL");
  const schema = schemaFromUrl(url);
  const client = new Client({ connectionString: url });

  const report: string[] = [];
  const log = (s: string) => {
    report.push(s);
    console.log(s);
  };

  log("=".repeat(60));
  log("PRODUCTION PRE-MIGRATION DUPLICATE AUDIT (READ-ONLY)");
  log("=".repeat(60));

  await client.connect();

  try {
    // PHASE 1 — Connection confirmation
    log("\n--- PHASE 1: Connection Confirmation ---");
    const conn = await client.query(`
      SELECT current_database() AS db_name,
             inet_server_addr()::text AS host,
             current_schema() AS search_path
    `);
    const row = conn.rows[0] as { db_name: string; host: string; search_path: string };
    log(`DB name: ${row?.db_name ?? "?"}`);
    log(`DB host: ${row?.host ?? "?"}`);
    log(`Schema search_path: ${row?.search_path ?? schema}`);
    log(`Connection: ${maskUrl(url)}`);
    log("WARNING: Ensure this is PRODUCTION. Do NOT use local or preview DB.");

    const schemaQual = schema ? `"${schema}"` : '"public"';

    // Resolve actual table names — check public and common schemas
    const allTables = await client.query(
      `SELECT table_schema, table_name FROM information_schema.tables
       WHERE table_schema IN ('public', '8fold_test')
       AND table_name IN ('TransferRecord', 'transfer_records', 'LedgerEntry', 'ledger_entries')
       ORDER BY table_schema, table_name`
    );
    const rows = allTables.rows as { table_schema: string; table_name: string }[];
    const trRow = rows.find((r) => r.table_name === "TransferRecord" || r.table_name === "transfer_records");
    const leRow = rows.find((r) => r.table_name === "LedgerEntry" || r.table_name === "ledger_entries");
    const trSchema = (trRow?.table_schema ?? schema) || "public";
    const leSchema = (leRow?.table_schema ?? schema) || "public";
    const trTable = trRow?.table_name;
    const leTable = leRow?.table_name;

    if (!trTable) {
      log("\n--- PHASE 2: TransferRecord ---");
      log("SKIP: Table TransferRecord/transfer_records not found in public or 8fold_test.");
    }
    if (!leTable) {
      log("\n--- PHASE 3: LedgerEntry ---");
      log("SKIP: Table LedgerEntry/ledger_entries not found.");
    }
    if (!trTable && !leTable) {
      log("\n--- PHASE 5: Pre-Migration Safety Summary ---");
      log("TransferRecord: SKIP (table not found)");
      log("LedgerEntry: SKIP (table not found)");
      log("Safe to apply migrations? YES (no existing data to conflict)");
      log("\n" + "=".repeat(60));
      log("AUDIT COMPLETE. NO MUTATIONS PERFORMED.");
      log("=".repeat(60));
      const fs = await import("fs");
      const path = await import("path");
      const outDir = path.join(process.cwd(), "..", "..", "reports");
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "pre-migration-duplicate-audit.txt"), report.join("\n"), "utf-8");
      await client.end();
      return;
    }

    const trSchemaQual = `"${trSchema}"`;
    const leSchemaQual = `"${leSchema}"`;
    const trQual = `"${trTable}"`;
    const leQual = `"${leTable}"`;
    const jc = trTable === "transfer_records" ? "job_id" : '"jobId"';
    const rc = trTable === "transfer_records" ? "role" : '"role"';
    const tc = trTable === "transfer_records" ? "created_at" : '"createdAt"';
    const ljc = leTable === "ledger_entries" ? "job_id" : '"jobId"';
    const ltc = leTable === "ledger_entries" ? "type" : '"type"';
    const lsc = leTable === "ledger_entries" ? "stripe_ref" : '"stripeRef"';
    const lcc = leTable === "ledger_entries" ? "created_at" : '"createdAt"';

    let trStatus: "PASS" | "FAIL" | "SKIP" = !trTable ? "SKIP" : "PASS";
    let leStatus: "PASS" | "FAIL" | "SKIP" = !leTable ? "SKIP" : "PASS";
    let trDuplicateGroups = 0;
    let trDuplicateRows = 0;
    let leDuplicateGroups = 0;
    let leDuplicateRows = 0;

    // PHASE 2 — TransferRecord duplicates
    if (trTable) {
      log("\n--- PHASE 2: TransferRecord Duplicates ---");
      log(`Constraint: UNIQUE (${jc}, ${rc})`);

      const trGroups = await client.query(
        `SELECT ${jc} AS "jobId", ${rc} AS "role", COUNT(*) AS count
         FROM ${trSchemaQual}.${trQual}
         GROUP BY ${jc}, ${rc}
         HAVING COUNT(*) > 1`
      );

      if (trGroups.rows.length === 0) {
        log("Result: PASS (zero duplicate groups)");
      } else {
        trStatus = "FAIL";
        trDuplicateGroups = trGroups.rows.length;
        for (const r of trGroups.rows as Array<{ count: string }>) {
          trDuplicateRows += parseInt(r.count, 10);
        }
        log(`Result: FAIL — ${trDuplicateGroups} duplicate groups, ${trDuplicateRows} total duplicate rows`);
        log("\nDuplicate groups:");
        for (const r of trGroups.rows as Array<{ jobId: string; role: string; count: string }>) {
          log(`  jobId=${r.jobId} role=${r.role} count=${r.count}`);
        }

        const trFull = await client.query(
          `SELECT *
           FROM ${trSchemaQual}.${trQual}
           WHERE (${jc}, ${rc}) IN (
             SELECT ${jc}, ${rc}
             FROM ${trSchemaQual}.${trQual}
             GROUP BY ${jc}, ${rc}
             HAVING COUNT(*) > 1
           )
           ORDER BY ${jc}, ${rc}, ${tc}`
        );
        log(`\nFull duplicate rows (${trFull.rows.length}):`);
        for (const r of trFull.rows.slice(0, 10) as Array<Record<string, unknown>>) {
          log(`  id=${r.id} jobId=${r.jobId ?? r.job_id} role=${r.role} status=${r.status} amountCents=${r.amountCents ?? r.amount_cents} createdAt=${r.createdAt ?? r.created_at}`);
        }
        if (trFull.rows.length > 10) {
          log(`  ... and ${trFull.rows.length - 10} more`);
        }
      }
    }

    // PHASE 3 — LedgerEntry duplicates
    if (leTable) {
      log("\n--- PHASE 3: LedgerEntry Duplicates ---");
      log(`Constraint: UNIQUE (${ljc}, ${ltc}, ${lsc}) WHERE ${lsc} IS NOT NULL`);

      const leGroups = await client.query(
        `SELECT ${ljc} AS "jobId", ${ltc} AS "type", ${lsc} AS "stripeRef", COUNT(*) AS count
         FROM ${leSchemaQual}.${leQual}
         WHERE ${lsc} IS NOT NULL
         GROUP BY ${ljc}, ${ltc}, ${lsc}
         HAVING COUNT(*) > 1`
      );

      if (leGroups.rows.length === 0) {
        log("Result: PASS (zero duplicate groups)");
      } else {
        leStatus = "FAIL";
        leDuplicateGroups = leGroups.rows.length;
        for (const r of leGroups.rows as Array<{ count: string }>) {
          leDuplicateRows += parseInt(r.count, 10);
        }
        log(`Result: FAIL — ${leDuplicateGroups} duplicate groups, ${leDuplicateRows} total duplicate rows`);
        log("\nDuplicate groups:");
        for (const r of leGroups.rows as Array<{ jobId: string; type: string; stripeRef: string; count: string }>) {
          log(`  jobId=${r.jobId} type=${r.type} stripeRef=${r.stripeRef} count=${r.count}`);
        }

        const leFull = await client.query(
          `SELECT *
           FROM ${leSchemaQual}.${leQual}
           WHERE ${lsc} IS NOT NULL
           AND (${ljc}, ${ltc}, ${lsc}) IN (
             SELECT ${ljc}, ${ltc}, ${lsc}
             FROM ${leSchemaQual}.${leQual}
             WHERE ${lsc} IS NOT NULL
             GROUP BY ${ljc}, ${ltc}, ${lsc}
             HAVING COUNT(*) > 1
           )
           ORDER BY ${ljc}, ${ltc}, ${lsc}, ${lcc}`
        );
        log(`\nFull duplicate rows (${leFull.rows.length}):`);
        for (const r of leFull.rows.slice(0, 10) as Array<Record<string, unknown>>) {
          log(`  id=${r.id} jobId=${r.jobId ?? r.job_id} type=${r.type} stripeRef=${r.stripeRef ?? r.stripe_ref} amountCents=${r.amountCents ?? r.amount_cents} createdAt=${r.createdAt ?? r.created_at}`);
        }
        if (leFull.rows.length > 10) {
          log(`  ... and ${leFull.rows.length - 10} more`);
        }
      }
    }

    // PHASE 4 — Risk analysis (if duplicates exist)
    let dedupeProposal = "";
    if (trStatus === "FAIL" || leStatus === "FAIL") {
      log("\n--- PHASE 4: Dedupe Proposal (DO NOT EXECUTE) ---");
      if (trStatus === "FAIL") {
        dedupeProposal += `
TransferRecord dedupe strategy:
- For each (jobId, role) group with duplicates:
  1. Compare rows: status, amountCents, stripeTransferId.
  2. If identical: keep earliest (min createdAt), soft-delete or mark others.
  3. If amounts differ: investigate as potential double-release; manual review.
  4. Proposed SQL (KEEP EARLIEST per group — REVIEW BEFORE RUNNING):
     WITH ranked AS (
       SELECT id, ${jc}, ${rc}, ${tc},
              ROW_NUMBER() OVER (PARTITION BY ${jc}, ${rc} ORDER BY ${tc} ASC) AS rn
       FROM ${trSchemaQual}.${trQual}
       WHERE (${jc}, ${rc}) IN (
         SELECT ${jc}, ${rc} FROM ${trSchemaQual}.${trQual}
         GROUP BY ${jc}, ${rc} HAVING COUNT(*) > 1
       )
     )
     -- DELETE FROM ${trSchemaQual}.${trQual} WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
     -- ^ UNCOMMENT ONLY AFTER APPROVAL
`;
      }
      if (leStatus === "FAIL") {
        dedupeProposal += `
LedgerEntry dedupe strategy:
- For each (jobId, type, stripeRef) group with duplicates:
  1. Compare rows: amountCents, direction, bucket.
  2. If identical: keep earliest (min createdAt).
  3. If amounts differ: investigate; may indicate double webhook processing.
  4. Proposed SQL (KEEP EARLIEST per group — REVIEW BEFORE RUNNING):
     WITH ranked AS (
       SELECT id, ${ljc}, ${ltc}, ${lsc}, ${lcc},
              ROW_NUMBER() OVER (PARTITION BY ${ljc}, ${ltc}, ${lsc} ORDER BY ${lcc} ASC) AS rn
       FROM ${leSchemaQual}.${leQual}
       WHERE ${lsc} IS NOT NULL
       AND (${ljc}, ${ltc}, ${lsc}) IN (
         SELECT ${ljc}, ${ltc}, ${lsc} FROM ${leSchemaQual}.${leQual}
         WHERE ${lsc} IS NOT NULL
         GROUP BY ${ljc}, ${ltc}, ${lsc} HAVING COUNT(*) > 1
       )
     )
     -- DELETE FROM ${leSchemaQual}.${leQual} WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
     -- ^ UNCOMMENT ONLY AFTER APPROVAL
`;
      }
      log(dedupeProposal);
    }

    // PHASE 5 — Safety summary
    log("\n--- PHASE 5: Pre-Migration Safety Summary ---");

    const trRisk = trStatus === "FAIL" ? (trDuplicateRows > 10 ? "HIGH" : "MEDIUM") : "N/A";
    const leRisk = leStatus === "FAIL" ? (leDuplicateRows > 10 ? "HIGH" : "MEDIUM") : "N/A";

    log(`TransferRecord duplicate status: ${trStatus}`);
    log(`  Count: ${trDuplicateGroups} groups, ${trDuplicateRows} rows`);
    log(`  Risk level: ${trRisk}`);

    log(`LedgerEntry duplicate status: ${leStatus}`);
    log(`  Count: ${leDuplicateGroups} groups, ${leDuplicateRows} rows`);
    log(`  Risk level: ${leRisk}`);

    const safeToApply = trStatus !== "FAIL" && leStatus !== "FAIL";
    log(`\nSafe to apply uniqueness migrations? ${safeToApply ? "YES" : "NO"}`);
    log(`Reason: ${safeToApply ? "No duplicates detected." : "Duplicates exist. Run dedupe plan and re-audit before applying migrations."}`);

    log("\n" + "=".repeat(60));
    log("AUDIT COMPLETE. NO MUTATIONS PERFORMED.");
    log("=".repeat(60));

    // Write report to file (repo root reports/ when run from apps/api)
    const fs = await import("fs");
    const path = await import("path");
    const outDir = path.join(process.cwd(), "..", "..", "reports");
    const outPath = path.join(outDir, "pre-migration-duplicate-audit.txt");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, report.join("\n"), "utf-8");
    console.log(`\nReport written to ${outPath}`);

    if (!safeToApply) {
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
