/**
 * Safely apply migration 0130 and verify the RoutingStatus enum.
 * Step 1: Confirm database connection
 * Step 2: Check enum values before migration
 * Step 3: Run migration
 * Step 4: Verify enum values after migration
 * Step 5: Confirm migration history
 */
import path from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";

const repoRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(repoRoot, "apps/api/.env.local") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required (from apps/api/.env.local)");
  process.exit(1);
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const db = u.pathname?.replace(/^\//, "") || "?";
    const schema = u.searchParams.get("schema") ?? "(none)";
    return `host=${host} database=${db} schema=${schema}`;
  } catch {
    return "(invalid URL)";
  }
}

async function getEnumValues(client: Client): Promise<string[]> {
  const res = await client.query<{ enumlabel: string }>(`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'RoutingStatus'
    ORDER BY e.enumsortorder
  `);
  return res.rows.map((r) => r.enumlabel);
}

let before: string[] = [];
let after: string[] = [];

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log("Step 1 — Database connection");
    console.log("  Active:", maskUrl(databaseUrl));
    console.log("");

    console.log("Step 2 — Enum values BEFORE migration");
    before = await getEnumValues(client);
    if (before.length === 0) {
      console.log("  (No RoutingStatus enum found, or typname differs)");
    } else {
      console.log("  ", before.join(", "));
      if (before.includes("INVITE_ACCEPTED")) {
        console.log("  INVITE_ACCEPTED already exists. Migration 0130 will be a no-op.");
      }
    }
    console.log("");

    await client.end();
  } catch (e) {
    await client.end();
    throw e;
  }

  console.log("Step 3 — Running pnpm db:migrate");
  const { execSync } = await import("node:child_process");
  execSync("pnpm db:migrate", {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env },
  });
  console.log("");

  const client2 = new Client({ connectionString: databaseUrl });
  await client2.connect();

  try {
    const schema = (() => {
      try {
        const u = new URL(databaseUrl);
        return u.searchParams.get("schema")?.trim();
      } catch {
        return null;
      }
    })();
    if (schema) {
      await client2.query(`set search_path to "${schema}", public`);
    }

    console.log("Step 4 — Enum values AFTER migration");
    after = await getEnumValues(client2);
    if (after.length === 0) {
      console.log("  (No RoutingStatus enum found)");
    } else {
      console.log("  ", after.join(", "));
      console.log("  INVITE_ACCEPTED present:", after.includes("INVITE_ACCEPTED") ? "YES" : "NO");
    }
    console.log("");

    console.log("Step 5 — Migration history (drizzle_sql_migrations)");
    const history = await client2.query<{ id: string; applied_at: Date }>(`
      SELECT id, applied_at
      FROM drizzle_sql_migrations
      ORDER BY applied_at DESC
      LIMIT 10
    `);
    if (history.rows.length === 0) {
      console.log("  (Table empty or in different schema)");
    } else {
      for (const row of history.rows) {
        console.log(`  ${row.id} @ ${row.applied_at.toISOString()}`);
      }
      const has0130 = history.rows.some((r) => r.id.includes("0130"));
      console.log("  0130 recorded:", has0130 ? "YES" : "NO");
    }

    await client2.end();
  } catch (e) {
    await client2.end();
    throw e;
  }

  console.log("");
  console.log("Done. Report:");
  console.log("  • active database:", maskUrl(databaseUrl));
  console.log("  • enum before:", before.join(", "));
  console.log("  • enum after:", after.join(", "));
  console.log("  • migration history: see above");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
