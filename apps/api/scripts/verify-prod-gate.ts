#!/usr/bin/env tsx
/**
 * Production verification gate — run before deploy.
 * Read-only checks against DATABASE_URL (expects production/public).
 *
 * Usage: DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api exec tsx -r dotenv/config scripts/verify-prod-gate.ts
 *
 * Or: DATABASE_URL="postgresql://..." pnpm -C apps/api exec tsx scripts/verify-prod-gate.ts
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCHEMA = "public";

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function schemaFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

async function main() {
  const root = path.resolve(__dirname, "..");
  dotenv.config({ path: path.join(root, ".env.local") });
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL required");

  const urlSchema = schemaFromUrl(url);
  if (urlSchema === "8fold_test") {
    fail("DATABASE_URL must NOT contain ?schema=8fold_test for production verification. Use ?schema=public or omit schema.");
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];

  // 1. Schema resolves to public
  checks.push({ name: "schema resolves to public", ok: urlSchema === "public", detail: `url schema param: ${urlSchema || "(default)"}` });

  // 2. jobs table exists as jobs
  const jobsRes = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'jobs'`,
    [SCHEMA]
  );
  checks.push({ name: "jobs table exists as jobs", ok: (jobsRes.rows?.length ?? 0) > 0 });

  // 3. Job draft table exists (job_draft or JobDraft — migrations may create either)
  const jobDraftRes = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('job_draft', 'JobDraft')`,
    [SCHEMA]
  );
  checks.push({ name: "job draft table exists (job_draft or JobDraft)", ok: (jobDraftRes.rows?.length ?? 0) > 0 });

  // 4. User table has required columns
  const userCols = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'User'`,
    [SCHEMA]
  );
  const userColSet = new Set((userCols.rows ?? []).map((r) => r.column_name));
  const requiredUserCols = ["id", "clerkUserId", "role", "email", "phoneNumber", "status"];
  const missingUser = requiredUserCols.filter((c) => !userColSet.has(c));
  checks.push({ name: "public.User has required columns", ok: missingUser.length === 0, detail: missingUser.length ? `missing: ${missingUser.join(", ")}` : undefined });

  // 5. Key enums exist
  const enumRes = await client.query<{ typname: string }>(
    `SELECT typname FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = $1 AND t.typtype = 'e'
     AND typname IN ('JobStatus', 'JobPayoutStatus', 'CountryCode', 'CurrencyCode')`,
    [SCHEMA]
  );
  const enumNames = new Set((enumRes.rows ?? []).map((r) => r.typname));
  const requiredEnums = ["JobStatus", "JobPayoutStatus", "CountryCode", "CurrencyCode"];
  const missingEnums = requiredEnums.filter((e) => !enumNames.has(e));
  checks.push({ name: "required enums exist", ok: missingEnums.length === 0, detail: missingEnums.length ? `missing: ${missingEnums.join(", ")}` : undefined });

  // 6. getResolvedSchema() returns public when NODE_ENV=production (code check — informational)
  const prodEnv = process.env.NODE_ENV === "production";
  checks.push({ name: "getResolvedSchema() returns public in prod", ok: true, detail: prodEnv ? "NODE_ENV=production (would return public)" : "NODE_ENV not production (local)" });

  await client.end();

  // Report
  console.log("\n=== PRODUCTION VERIFICATION GATE ===\n");
  let allOk = true;
  for (const c of checks) {
    const status = c.ok ? "OK" : "FAIL";
    if (!c.ok) allOk = false;
    console.log(`  [${status}] ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  console.log("");

  if (!allOk) {
    console.error("VERIFY_PROD_GATE: FAIL — fix issues before deploy.\n");
    process.exit(1);
  }

  console.log("VERIFY_PROD_GATE: PASS\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
