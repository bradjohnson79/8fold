#!/usr/bin/env npx tsx
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.join(scriptDir, "..", ".env.local") });

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required (apps/api/.env.local)");
  }

  const { db } = await import("../db/drizzle");

  const tables = await db.execute(sql`
    select table_schema, table_name
    from information_schema.tables
    where table_name in ('Job', 'JobPhoto')
    order by table_schema, table_name
  `);

  console.log("=== Job / JobPhoto table locations ===");
  for (const row of (tables as any).rows ?? []) {
    console.log(`${String(row.table_schema)}.${String(row.table_name)}`);
  }

  const columns = await db.execute(sql`
    select ordinal_position, column_name, data_type, udt_schema, udt_name, is_nullable
    from information_schema.columns
    where table_name = 'Job'
    order by ordinal_position asc
  `);

  console.log("\n=== Job columns (ordered) ===");
  for (const row of (columns as any).rows ?? []) {
    console.log(
      `${String(row.ordinal_position).padStart(3, " ")} | ${String(row.column_name)} | ${String(row.data_type)} | udt=${String(row.udt_schema)}.${String(row.udt_name)} | nullable=${String(row.is_nullable)}`
    );
  }

  const enums = await db.execute(sql`
    select n.nspname as enum_schema, t.typname as enum_name
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname ilike '%JobStatus%'
    order by n.nspname, t.typname
  `);

  console.log("\n=== JobStatus enum schema ===");
  for (const row of (enums as any).rows ?? []) {
    console.log(`${String(row.enum_schema)}.${String(row.enum_name)}`);
  }
}

main().catch((err) => {
  console.error("inspectJobSchema failed:");
  console.error(err);
  process.exit(1);
});
