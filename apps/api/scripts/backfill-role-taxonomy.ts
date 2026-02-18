/**
 * Backfill legacy roles → canonical roles (single-role accounts).
 *
 * Canonical roles:
 * - JOB_POSTER
 * - ROUTER
 * - CONTRACTOR
 * - ADMIN
 *
 * Legacy roles to eliminate:
 * - USER -> JOB_POSTER
 * - CUSTOMER -> JOB_POSTER
 *
 * NOTE:
 * - This is safe to run multiple times.
 * - It only updates roles for non-system identities.
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/backfill-role-taxonomy.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Env isolation: load from apps/api/.env.local only (no repo-root fallback).
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });
import { Client } from "pg";

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function schemaFromDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

async function main() {
  const DATABASE_URL = mustEnv("DATABASE_URL");
  const schema = schemaFromDatabaseUrl(DATABASE_URL);
  const usersT = `"${schema}"."User"`;

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const before = await client.query(
    `select role::text as role, count(*)::int as n
     from ${usersT}
     group by role
     order by role`,
  );
  console.log("role counts (before):", before.rows);

  const legacy = await client.query(
    `select role::text as role, count(*)::int as n
     from ${usersT}
     where role in ('USER','CUSTOMER')
       and coalesce("authUserId",'') not like 'system:%'
     group by role
     order by role`,
  );
  console.log("legacy role counts:", legacy.rows);

  const updated = await client.query(
    `update ${usersT}
     set role = 'JOB_POSTER', "updatedAt" = now()
     where role in ('USER','CUSTOMER')
       and coalesce("authUserId",'') not like 'system:%'`,
  );
  console.log("updated rows:", updated.rowCount);

  const after = await client.query(
    `select role::text as role, count(*)::int as n
     from ${usersT}
     group by role
     order by role`,
  );
  console.log("role counts (after):", after.rows);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

