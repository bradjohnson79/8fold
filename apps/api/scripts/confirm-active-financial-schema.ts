#!/usr/bin/env tsx
/**
 * Confirm Active Financial Schema (READ-ONLY).
 *
 * Usage: DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api exec tsx scripts/confirm-active-financial-schema.ts
 */

import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function main() {
  const url = mustEnv("DATABASE_URL");

  const u = new URL(url);
  const host = u.hostname ?? "";
  if (host.includes("localhost") || host === "127.0.0.1") {
    console.error("ABORT: localhost detected");
    process.exit(1);
  }
  if (host.includes("preview")) {
    console.error("ABORT: preview detected");
    process.exit(1);
  }
  if (!host.includes("pooler")) {
    console.error("ABORT: Not Neon production pooler");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  console.log("--- current_schema() ---");
  const schemaRes = await client.query("SELECT current_schema() AS current_schema");
  const currentSchema = (schemaRes.rows[0] as { current_schema: string })?.current_schema ?? "?";
  console.log("current_schema():", currentSchema);

  console.log("\n--- search_path ---");
  const pathRes = await client.query("SHOW search_path");
  const searchPath = (pathRes.rows[0] as { search_path: string })?.search_path ?? "?";
  console.log("search_path:", searchPath);

  console.log("\n--- Tables: TransferRecord, LedgerEntry ---");
  const tablesRes = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name IN ('TransferRecord', 'LedgerEntry')
    ORDER BY table_schema
  `);

  const rows = tablesRes.rows as { table_schema: string; table_name: string }[];
  if (rows.length === 0) {
    console.log("No TransferRecord or LedgerEntry tables found.");
    await client.end();
    return;
  }

  const schemas = [...new Set(rows.map((r) => r.table_schema))];
  console.log("Found in schemas:", schemas.join(", "));
  for (const r of rows) {
    console.log(`  ${r.table_schema}.${r.table_name}`);
  }

  console.log("\n--- Row counts per schema ---");
  const counts: Record<string, { LedgerEntry: number; TransferRecord: number }> = {};
  for (const schema of schemas) {
    counts[schema] = { LedgerEntry: 0, TransferRecord: 0 };
  }

  for (const schema of schemas) {
    const hasLedger = rows.some((r) => r.table_schema === schema && r.table_name === "LedgerEntry");
    const hasTransfer = rows.some((r) => r.table_schema === schema && r.table_name === "TransferRecord");

    if (hasLedger) {
      const res = await client.query(`SELECT COUNT(*) AS c FROM "${schema}"."LedgerEntry"`);
      counts[schema].LedgerEntry = parseInt(String((res.rows[0] as { c: string })?.c ?? "0"), 10);
    }
    if (hasTransfer) {
      const res = await client.query(`SELECT COUNT(*) AS c FROM "${schema}"."TransferRecord"`);
      counts[schema].TransferRecord = parseInt(String((res.rows[0] as { c: string })?.c ?? "0"), 10);
    }
  }

  for (const schema of schemas) {
    const c = counts[schema];
    console.log(`${schema}: LedgerEntry=${c.LedgerEntry}, TransferRecord=${c.TransferRecord}`);
  }

  const activeSchema = schemas.find((s) => counts[s].LedgerEntry > 0 || counts[s].TransferRecord > 0);
  const resolveSchema = currentSchema;

  console.log("\n--- Summary ---");
  console.log("Active schema (non-zero rows):", activeSchema ?? "NONE");
  console.log("Production queries resolve to:", resolveSchema);
  console.log("Row counts:", JSON.stringify(counts, null, 2));

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
