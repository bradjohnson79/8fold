#!/usr/bin/env tsx
/**
 * Production Migration Execution (0065, 0066)
 * READ DATABASE_URL from apps/api/.env.local
 *
 * Usage: DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api exec tsx scripts/run-production-migrations.ts
 */

import { Client } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function main() {
  const url = mustEnv("DATABASE_URL");
  const client = new Client({ connectionString: url });
  await client.connect();

  const report: string[] = [];
  const log = (s: string) => {
    report.push(s);
    console.log(s);
  };

  try {
    // PHASE 1
    log("--- PHASE 1: Production DB Confirmation ---");
    const conn = await client.query(
      "SELECT current_database() AS db_name, inet_server_addr()::text AS host, current_schema() AS search_path"
    );
    const r = conn.rows[0] as { db_name: string; host: string; search_path: string };
    log(`DATABASE_URL host: ${url.replace(/:[^:@]+@/, ":****@").split("/")[2]?.split("?")[0] ?? "?"}`);
    log(`DB name: ${r?.db_name ?? "?"}`);
    log(`search_path: ${r?.search_path ?? "public"}`);
    log("Neon pooler: " + (url.includes("pooler") ? "YES" : "NO"));

    // PHASE 2 — 0065
    log("\n--- PHASE 2: Apply Migration 0065 ---");
    const sql65 = readFileSync(join(process.cwd(), "..", "..", "drizzle", "0065_admin_adjustment_idempotency.sql"), "utf-8");
    await client.query(sql65);
    log("Migration 0065 executed.");

    const t65 = await client.query(
      `SELECT table_schema, table_name FROM information_schema.tables
       WHERE table_name ILIKE '%AdminAdjustmentIdempotency%' OR table_name = 'AdminAdjustmentIdempotency'`
    );
    log(`Table exists: ${t65.rows.length > 0 ? "YES" : "NO"}`);
    if (t65.rows.length > 0) {
      const schema = (t65.rows[0] as { table_schema: string }).table_schema;
      const tbl = (t65.rows[0] as { table_name: string }).table_name;
      const uq = await client.query(
        `SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_schema = $1 AND table_name = $2 AND constraint_type = 'UNIQUE'`,
        [schema, tbl]
      );
      log(`idempotencyKey unique constraint: ${uq.rows.length > 0 ? "PRESENT" : "CHECK MANUALLY"}`);
    }

    // PHASE 3 — 0066 (run per schema where tables exist)
    log("\n--- PHASE 3: Apply Migration 0066 ---");
    const schemas = await client.query(
      `SELECT DISTINCT table_schema FROM information_schema.tables
       WHERE table_name IN ('TransferRecord', 'LedgerEntry')
       AND table_schema IN ('public', '8fold_test')`
    );
    for (const row of schemas.rows as { table_schema: string }[]) {
      const s = row.table_schema;
      const hasTr = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'TransferRecord'`,
        [s]
      );
      const hasLe = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'LedgerEntry'`,
        [s]
      );
      if (hasTr.rows.length > 0) {
        await client.query(
          `CREATE UNIQUE INDEX IF NOT EXISTS "TransferRecord_job_role_uniq"
           ON "${s}"."TransferRecord" ("jobId", "role")`
        );
        log(`  Schema ${s}: TransferRecord index created`);
      }
      if (hasLe.rows.length > 0) {
        const hasStripeRef = await client.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'LedgerEntry' AND column_name = 'stripeRef'`,
          [s]
        );
        if (hasStripeRef.rows.length > 0) {
          await client.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_job_type_stripeRef_uniq"
             ON "${s}"."LedgerEntry" ("jobId", "type", "stripeRef")
             WHERE "jobId" IS NOT NULL AND "stripeRef" IS NOT NULL`
          );
          log(`  Schema ${s}: LedgerEntry index created`);
        } else {
          log(`  Schema ${s}: LedgerEntry skipped (no stripeRef column)`);
        }
      }
    }
    log("Migration 0066 executed.");

    const idx = await client.query(
      `SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
       WHERE tablename IN ('TransferRecord', 'LedgerEntry')
       AND (indexname LIKE '%job_role_uniq%' OR indexname LIKE '%job_type_stripeRef%')
       ORDER BY schemaname, tablename`
    );
    log("Index verification:");
    for (const row of idx.rows as Array<{ schemaname: string; tablename: string; indexname: string; indexdef: string }>) {
      log(`  ${row.schemaname}.${row.tablename}: ${row.indexname}`);
    }
    const hasTrUniq = idx.rows.some((r: { indexname: string }) => r.indexname?.includes("job_role_uniq"));
    const hasLeUniq = idx.rows.some((r: { indexname: string }) => r.indexname?.includes("job_type_stripeRef"));
    log(`TransferRecord unique (jobId, role): ${hasTrUniq ? "YES" : "NO"}`);
    log(`LedgerEntry partial unique (jobId, type, stripeRef): ${hasLeUniq ? "YES" : "NO"}`);

    // PHASE 4 — Row counts (per schema)
    log("\n--- PHASE 4: Row Count Verification ---");
    const trSchemas = await client.query(
      `SELECT table_schema FROM information_schema.tables WHERE table_name = 'TransferRecord' AND table_schema IN ('public', '8fold_test')`
    );
    let trTotal = 0;
    for (const row of trSchemas.rows as { table_schema: string }[]) {
      const cnt = await client.query(`SELECT COUNT(*) AS c FROM "${row.table_schema}"."TransferRecord"`);
      const n = parseInt((cnt.rows[0] as { c: string })?.c ?? "0", 10);
      trTotal += n;
      log(`  ${row.table_schema}.TransferRecord: ${n}`);
    }
    log(`TransferRecord total: ${trTotal}`);

    const leSchemas = await client.query(
      `SELECT table_schema FROM information_schema.tables WHERE table_name = 'LedgerEntry' AND table_schema IN ('public', '8fold_test')`
    );
    let leTotal = 0;
    for (const row of leSchemas.rows as { table_schema: string }[]) {
      const cnt = await client.query(`SELECT COUNT(*) AS c FROM "${row.table_schema}"."LedgerEntry"`);
      const n = parseInt((cnt.rows[0] as { c: string })?.c ?? "0", 10);
      leTotal += n;
      log(`  ${row.table_schema}.LedgerEntry: ${n}`);
    }
    log(`LedgerEntry total: ${leTotal}`);

    // PHASE 4b — Endpoint smoke
    log("\n--- PHASE 4b: Endpoint Smoke ---");
    try {
      const resp = await fetch("https://api.8fold.app/api/public/jobs/recent?limit=1");
      const ok = resp.status === 200;
      const json = await resp.json().catch(() => ({}));
      log(`GET https://api.8fold.app/api/public/jobs/recent?limit=1: ${resp.status}`);
      log(`ok: ${json?.ok ?? "?"}`);
      if (!ok || !json?.ok) {
        throw new Error(`Expected 200 and ok:true, got ${resp.status} ok=${json?.ok}`);
      }
    } catch (e) {
      log(`Endpoint smoke FAILED: ${e}`);
      throw e;
    }

    // PHASE 5 — Webhook invalid signature
    log("\n--- PHASE 5: Webhook Invalid Signature ---");
    try {
      const whResp = await fetch("https://api.8fold.app/api/webhooks/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "payment_intent.succeeded" }),
      });
      const expect400 = whResp.status === 400;
      log(`POST /api/webhooks/stripe (no signature): ${whResp.status} (expected 400)`);
      if (!expect400) {
        throw new Error(`Expected 400 for invalid signature, got ${whResp.status}`);
      }
    } catch (e) {
      log(`Webhook smoke FAILED: ${e}`);
      throw e;
    }

    log("\n--- FINAL STATUS: SAFE ---");
  } catch (err) {
    log("\n--- FINAL STATUS: FAILED ---");
    log(String(err));
    process.exit(1);
  } finally {
    await client.end();
  }

  const fs = await import("fs");
  fs.writeFileSync(join(process.cwd(), "..", "..", "reports", "production-migration-report.txt"), report.join("\n"), "utf-8");
  console.log("\nReport: reports/production-migration-report.txt");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
