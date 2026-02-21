#!/usr/bin/env tsx
/**
 * CI guard: verify public."User" has required columns.
 * Exits non-zero if mismatch. Run before deployment.
 *
 * Usage: DATABASE_URL="..." pnpm verify:prod-schema
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REQUIRED_COLUMNS = [
  "id",
  "clerkUserId",
  "role",
  "email",
  "phoneNumber",
  "status",
] as const;

async function main() {
  const root = path.resolve(__dirname, "..");
  dotenv.config({ path: path.join(root, ".env.local") });
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  const res = await client.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User'
  `);

  const columns = new Set((res.rows ?? []).map((r) => r.column_name));
  const missing: string[] = [];
  for (const col of REQUIRED_COLUMNS) {
    if (!columns.has(col)) missing.push(col);
  }

  await client.end();

  if (missing.length > 0) {
    console.error(`Schema mismatch: public."User" missing columns: ${missing.join(", ")}`);
    process.exit(1);
  }

  console.log("verify:prod-schema OK — public.\"User\" has required columns");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
