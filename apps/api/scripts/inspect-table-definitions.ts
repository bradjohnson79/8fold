#!/usr/bin/env tsx
/**
 * Inspect table definitions (READ-ONLY).
 * Usage: DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api exec tsx scripts/inspect-table-definitions.ts
 */

import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function getTableDef(client: Client, schema: string, table: string): Promise<string> {
  const lines: string[] = [];
  lines.push(`\n=== ${schema}."${table}" ===\n`);

  // Columns
  const colRes = await client.query(
    `
    SELECT column_name, data_type, udt_name, character_maximum_length,
           is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
    `,
    [schema, table]
  );

  if (colRes.rows.length === 0) {
    lines.push("(table does not exist)");
    return lines.join("\n");
  }

  lines.push("Columns:");
  for (const r of colRes.rows as { column_name: string; data_type: string; udt_name: string; character_maximum_length: number | null; is_nullable: string; column_default: string | null }[]) {
    const nullable = r.is_nullable === "YES" ? "" : " NOT NULL";
    const def = r.column_default ? ` DEFAULT ${r.column_default}` : "";
    const type = r.udt_name || r.data_type;
    lines.push(`  ${r.column_name} ${type}${nullable}${def}`);
  }

  // Indexes
  const idxRes = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`,
    [schema, table]
  );
  if (idxRes.rows.length > 0) {
    lines.push("\nIndexes:");
    for (const r of idxRes.rows as { indexname: string; indexdef: string }[]) {
      lines.push(`  ${r.indexdef}`);
    }
  }

  // Constraints (PK, FK, UNIQUE)
  const conRes2 = await client.query(
    `
    SELECT c.conname, pg_get_constraintdef(c.oid, true) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = $1 AND t.relname = $2
    `,
    [schema, table]
  );
  if (conRes2.rows.length > 0) {
    lines.push("\nConstraints:");
    for (const r of conRes2.rows as { conname: string; def: string }[]) {
      lines.push(`  ${r.conname}: ${r.def}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  const url = mustEnv("DATABASE_URL");
  const u = new URL(url);
  const host = u.hostname ?? "";
  if (host.includes("localhost") || host.includes("preview") || !host.includes("pooler")) {
    console.error("ABORT: Must be Neon production pooler");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  console.log("--- PHASE 1: 8fold_test canonical definitions ---");
  console.log(await getTableDef(client, "8fold_test", "LedgerEntry"));
  console.log(await getTableDef(client, "8fold_test", "TransferRecord"));

  console.log("\n--- PHASE 2: public definitions ---");
  console.log(await getTableDef(client, "public", "LedgerEntry"));
  console.log(await getTableDef(client, "public", "TransferRecord"));

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
