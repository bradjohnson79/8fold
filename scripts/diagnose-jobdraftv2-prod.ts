#!/usr/bin/env tsx
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(repoRoot, "apps/api/.env.local") });

function getSchemaName(databaseUrl: string): string {
  try {
    const u = new URL(databaseUrl);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const expectedSchema = getSchemaName(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(`set search_path to "${expectedSchema}", public`);

    const searchPath = await client.query(`show search_path`);
    const currentSchema = await client.query(`select current_schema()`);

    const tables = await client.query(
      `
      select table_name
      from information_schema.tables
      where table_schema = $1
        and table_name in ('JobDraftV2','JobDraftV2FieldState')
      order by table_name
      `,
      [expectedSchema]
    );

    const enums = await client.query(
      `
      select t.typname
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = $1
        and t.typname in ('JobDraftV2Step','JobDraftV2FieldStateStatus')
      order by t.typname
      `,
      [expectedSchema]
    );

    const columns = await client.query(
      `
      select column_name
      from information_schema.columns
      where table_schema = $1
        and table_name = 'JobDraftV2'
      `,
      [expectedSchema]
    );

    const requiredColumns = [
      "id",
      "userId",
      "countryCode",
      "stateCode",
      "currentStep",
      "data",
      "validation",
      "lastSavedAt",
      "version",
      "archivedAt",
      "jobId",
      "paymentIntentId",
      "paymentIntentCreatedAt",
      "createdAt",
      "updatedAt",
    ];

    const foundColumns = new Set(columns.rows.map((r) => String(r.column_name)));
    const missingColumns = requiredColumns.filter((c) => !foundColumns.has(c));

    const tableSet = new Set(tables.rows.map((r) => String(r.table_name)));
    const enumSet = new Set(enums.rows.map((r) => String(r.typname)));

    const tablesOk = tableSet.has("JobDraftV2") && tableSet.has("JobDraftV2FieldState");
    const enumsOk = enumSet.has("JobDraftV2Step") && enumSet.has("JobDraftV2FieldStateStatus");

    console.log(`EXPECTED_SCHEMA=${expectedSchema}`);
    console.log(`SEARCH_PATH=${searchPath.rows[0]?.search_path ?? ""}`);
    console.log(`CURRENT_SCHEMA=${currentSchema.rows[0]?.current_schema ?? ""}`);
    console.log(`TABLES_OK=${tablesOk}`);
    console.log(`ENUMS_OK=${enumsOk}`);
    console.log(`MISSING_COLUMNS=[${missingColumns.join(",")}]`);
    console.log(`FOUND_TABLES=[${[...tableSet].join(",")}]`);
    console.log(`FOUND_ENUMS=[${[...enumSet].join(",")}]`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
