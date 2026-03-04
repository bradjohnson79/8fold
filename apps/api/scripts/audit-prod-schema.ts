#!/usr/bin/env tsx
/**
 * Audit production schema: migration history + jobs columns.
 * Loads DATABASE_URL from apps/api/.env.local.
 * Run: DOTENV_CONFIG_PATH=apps/api/.env.local tsx apps/api/scripts/audit-prod-schema.ts
 */
import dotenv from "dotenv";
import path from "path";
import { Client } from "pg";

async function main() {
  const repoRoot = path.resolve(process.cwd());
  dotenv.config({ path: path.join(repoRoot, "apps/api/.env.local") });
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set. Ensure apps/api/.env.local exists.");
    process.exit(1);
  }
  console.log("STEP 1 — DATABASE_URL resolved:", url.replace(/:[^:@]+@/, ":****@"));

  const client = new Client({ connectionString: url });
  await client.connect();

  // STEP 2 — Migration history (this project uses drizzle_sql_migrations)
  const schema = (() => {
    try {
      const u = new URL(url);
      return u.searchParams.get("schema")?.trim() || null;
    } catch {
      return null;
    }
  })();
  if (schema) {
    await client.query(`set search_path to "${schema}", public`);
  }

  let migrationsExist = false;
  try {
    await client.query("SELECT 1 FROM drizzle_sql_migrations LIMIT 1");
    migrationsExist = true;
  } catch {
    migrationsExist = false;
  }

  if (!migrationsExist) {
    console.log("STEP 2 — drizzle_sql_migrations table does not exist yet. No migrations applied.");
  } else {
    const applied = await client.query(`
      SELECT id FROM drizzle_sql_migrations
      ORDER BY id DESC
      LIMIT 25
    `);
    console.log("STEP 2 — Applied migrations (last 25):");
    (applied.rows as { id: string }[]).forEach((r) => console.log("  -", r.id));
    const ids = (applied.rows as { id: string }[]).map((r) => r.id);
    console.log("  0116 applied:", ids.includes("0116_jobs_routing_columns.sql"));
    console.log("  0117 applied:", ids.includes("0117_jobs_appointment_execution_columns.sql"));
  }

  // STEP 3 — Jobs table columns (jobs lives in schema or public per search_path)
  const tableSchema = schema || "public";
  const cols = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = 'jobs'
      AND column_name IN (
        'appointment_at',
        'completed_at',
        'contractor_marked_complete_at',
        'poster_marked_complete_at',
        'routing_started_at',
        'routing_expires_at'
      )
    ORDER BY column_name
  `,
    [tableSchema]
  );
  const found = (cols.rows as { column_name: string }[]).map((r) => r.column_name);
  console.log("STEP 3 — Jobs columns present:", found.length ? found.join(", ") : "(none)");
  const missing = [
    "appointment_at",
    "completed_at",
    "contractor_marked_complete_at",
    "poster_marked_complete_at",
    "routing_started_at",
    "routing_expires_at",
  ].filter((c) => !found.includes(c));
  if (missing.length) {
    console.log("  MISSING:", missing.join(", "));
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
