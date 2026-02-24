#!/usr/bin/env tsx
/**
 * Align public."User" to canonical shape.
 * Production uses public schema; this adds missing columns + index + backfill.
 *
 * Usage: DATABASE_URL="..." pnpm exec tsx scripts/apply-0056-public-user-canonical.ts
 */
import dotenv from "dotenv";
import path from "path";
import { Client } from "pg";

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

  const alters = [
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "clerkUserId" text`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "name" text`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "accountStatus" text DEFAULT 'ACTIVE'`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "suspendedUntil" timestamptz`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "archivedAt" timestamptz`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "deletionReason" text`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "suspensionReason" text`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "archivedReason" text`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "updatedByAdminId" text`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "referredByRouterId" text`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "formattedAddress" text DEFAULT ''`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "latitude" double precision`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "longitude" double precision`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "legalStreet" text DEFAULT ''`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "legalCity" text DEFAULT ''`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "legalProvince" text DEFAULT ''`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "legalPostalCode" text DEFAULT ''`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "legalCountry" text DEFAULT 'US'`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "countryCode" text DEFAULT 'US'`,
    `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "stateCode" text DEFAULT ''`,
  ];

  for (const sql of alters) {
    console.log("Applying:", sql.slice(0, 70) + "...");
    await client.query(sql);
  }

  console.log("Creating unique index on clerkUserId...");
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "User_clerkUserId_unique"
    ON public."User" ("clerkUserId")
  `);

  console.log("Backfilling clerkUserId from authUserId...");
  const upd = await client.query(`
    UPDATE public."User"
    SET "clerkUserId" = "authUserId"
    WHERE "clerkUserId" IS NULL
    AND "authUserId" IS NOT NULL
  `);
  console.log("Backfill updated", upd.rowCount ?? 0, "rows");

  const cols = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User'
    ORDER BY ordinal_position
  `);
  const columnList = (cols.rows as { column_name: string }[]).map((r) => r.column_name);
  console.log("\nFinal public.\"User\" columns:", columnList.join(", "));

  await client.end();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
