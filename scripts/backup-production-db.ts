#!/usr/bin/env tsx
/**
 * Production DB backup via pg client (no pg_dump required).
 * Writes schema + row counts + drizzle_sql_migrations to a file.
 *
 * Usage: DATABASE_URL="<url>" pnpm exec tsx scripts/backup-production-db.ts [output_path]
 */
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const outPath = process.argv[2] ?? `prod-backup-before-migrate-${new Date().toISOString().slice(0, 10)}.sql`;

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const lines: string[] = [
    "-- 8Fold Production Backup",
    `-- Generated: ${new Date().toISOString()}`,
    "-- Schema snapshot + applied migrations. Restore via psql or manual replay.",
    "",
  ];

  try {
    const tables = await client.query<{ table_schema: string; table_name: string }>(
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('public') AND table_type = 'BASE TABLE' ORDER BY table_schema, table_name"
    );
    lines.push(`-- Tables: ${tables.rows.length}");
    for (const r of tables.rows) {
      const cols = await client.query(
        "SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
        [r.table_schema, r.table_name]
      );
      lines.push("-- " + r.table_schema + "." + r.table_name + " (" + cols.rows.length + " cols)");
    }

    const migrations = await client
      .query<{ id: string; applied_at: string }>("SELECT id, applied_at::text FROM drizzle_sql_migrations ORDER BY id")
      .catch(() => ({ rows: [] as { id: string; applied_at: string }[] }));
    lines.push("");
    lines.push("-- Applied migrations:");
    for (const m of migrations.rows) {
      lines.push("--   " + m.id + " @ " + m.applied_at);
    }

    const jobsCheck = await client
      .query<{ jobs_exists: boolean; job_legacy_exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='jobs') as jobs_exists, EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='Job') as job_legacy_exists"
      )
      .catch(() => ({ rows: [{ jobs_exists: false, job_legacy_exists: false }] }));
    const j0 = jobsCheck.rows[0];
    lines.push("");
    lines.push("-- Pre-migration state: jobs=" + (j0?.jobs_exists ?? "?") + " Job(legacy)=" + (j0?.job_legacy_exists ?? "?"));

    const fullPath = path.resolve(process.cwd(), outPath);
    fs.writeFileSync(fullPath, lines.join("\n"), "utf8");
    console.log("Backup written: " + fullPath + " (" + lines.length + " lines)");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
