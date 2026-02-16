/**
 * Introspect live DB schema for AuditLog table.
 * Run: pnpm exec tsx apps/api/scripts/inspect-auditlog.ts
 */

import path from "node:path";
import { Client } from "pg";

async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });
  dotenv.config({ path: path.join(process.cwd(), ".env") });

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("DATABASE_URL missing.");
    process.exit(1);
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log("=== COLUMNS ===");
  const colsRes = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = '8fold_test'
    AND table_name = 'AuditLog'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(colsRes.rows, null, 2));

  console.log("\n=== CONSTRAINTS ===");
  const constRes = await client.query(`
    SELECT conname, contype, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = 'AuditLog'
    AND n.nspname = '8fold_test'
  `);
  console.log(JSON.stringify(constRes.rows, null, 2));

  console.log("\n=== ENUMS (audit*) ===");
  const enumRes = await client.query(`
    SELECT typname, enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE typname ILIKE '%audit%'
    ORDER BY typname, e.enumsortorder
  `);
  console.log(JSON.stringify(enumRes.rows, null, 2));

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
