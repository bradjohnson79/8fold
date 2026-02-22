/**
 * Check if JobDraft migration (0052) is applied.
 * Usage: DATABASE_URL="..." pnpm exec tsx scripts/check-job-draft-migration.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "apps/api", ".env.local") });

const MIGRATION_ID = "0052_job_draft_v3.sql";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required. Set it or ensure apps/api/.env.local exists.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const schema = (() => {
      try {
        const u = new URL(url);
        const s = u.searchParams.get("schema");
        return s?.trim() || "public";
      } catch {
        return "public";
      }
    })();

    if (schema !== "public") {
      await client.query(`SET search_path TO "${schema}", public`);
    }

    const migTableExists = (
      await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'drizzle_sql_migrations'
        ) as exists`
      )
    ).rows[0]?.exists ?? false;

    let migrationApplied = false;
    if (migTableExists) {
      const migRes = await client.query<{ id: string }>(
        `SELECT id FROM drizzle_sql_migrations WHERE id = $1 LIMIT 1`,
        [MIGRATION_ID]
      );
      migrationApplied = migRes.rows.length > 0;
    }

    const tableRes = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = 'JobDraft'
      ) as exists`,
      [schema]
    );
    const tableExists = tableRes.rows[0]?.exists ?? false;

    console.log(`Schema: ${schema}`);
    console.log(`Migration ${MIGRATION_ID} applied: ${migrationApplied ? "YES" : "NO"}`);
    console.log(`JobDraft table exists: ${tableExists ? "YES" : "NO"}`);

    if (!migrationApplied || !tableExists) {
      console.log("\nTo apply: pnpm db:migrate");
      process.exit(1);
    }

    console.log("\nJobDraft migration OK.");
    process.exit(0);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
