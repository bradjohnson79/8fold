#!/usr/bin/env tsx
/**
 * One-off: Apply only 0055_add_phoneNumber_to_user.sql.
 * Use when production DB has migrations 0001-0054 applied and you need to add phoneNumber.
 *
 * Usage: DATABASE_URL="..." tsx scripts/apply-0055-phoneNumber-only.ts
 */
import dotenv from "dotenv";
import path from "path";
import { Client } from "pg";

function getSchema(url: string): string | null {
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s.trim()) ? s.trim() : null;
  } catch {
    return null;
  }
}

async function main() {
  const root = path.resolve(__dirname, "..");
  dotenv.config({ path: path.join(root, "apps/api/.env.local") });
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  const schema = getSchema(url);
  if (schema) {
    await client.query(`create schema if not exists "${schema}"`);
    await client.query(`set search_path to "${schema}", public`);
  }

  const sqls = [
    `alter table "User" add column if not exists "phoneNumber" text;`,
    // Try UserStatus enum first; fallback to text if enum missing (e.g. public schema)
    `alter table "User" add column if not exists "status" "UserStatus" default 'ACTIVE'::"UserStatus";`,
  ];
  for (const sql of sqls) {
    try {
      console.log("Applying:", sql.slice(0, 60) + "...");
      await client.query(sql);
    } catch (e) {
      if (e?.code === "42704" && sql.includes("UserStatus")) {
        console.log("UserStatus enum missing, using text for status");
        await client.query(`alter table "User" add column if not exists "status" text default 'ACTIVE';`);
      } else throw e;
    }
  }
  await client.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
