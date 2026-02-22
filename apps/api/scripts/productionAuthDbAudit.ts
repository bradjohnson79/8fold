/**
 * Production Auth & DB Audit
 * Connects to DATABASE_URL, lists tables, enums, migrations, User schema.
 * Usage: DATABASE_URL="..." pnpm -C apps/api exec tsx scripts/productionAuthDbAudit.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  const report: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    database: (() => {
      try {
        const u = new URL(url);
        return u.pathname?.replace(/^\//, "").split("?")[0] ?? "unknown";
      } catch {
        return "unknown";
      }
    })(),
    tables: [] as string[],
    enums: [] as { name: string; values: string[] }[],
    migrations: [] as string[],
    userColumns: [] as { column_name: string; data_type: string; is_nullable: string }[],
    userRoleEnumValues: [] as string[],
    userStatusEnumValues: [] as string[],
    drizzleMigrationsTableExists: false,
  };

  try {
    // 1. List all tables in public schema
    const tablesRes = await client.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    report.tables = tablesRes.rows.map((r) => r.tablename);

    // 2. List enum types
    const enumsRes = await client.query<{ typname: string; enumlabel: string }>(`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder
    `);
    const enumMap = new Map<string, string[]>();
    for (const r of enumsRes.rows) {
      const arr = enumMap.get(r.typname) ?? [];
      arr.push(r.enumlabel);
      enumMap.set(r.typname, arr);
    }
    report.enums = Array.from(enumMap.entries()).map(([name, values]) => ({ name, values }));

    // 3. Check drizzle_sql_migrations
    const migTableRes = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'drizzle_sql_migrations'
      ) as exists
    `);
    report.drizzleMigrationsTableExists = migTableRes.rows[0]?.exists ?? false;

    if (report.drizzleMigrationsTableExists) {
      const migRes = await client.query<{ id: string }>(`
        SELECT id FROM drizzle_sql_migrations ORDER BY id
      `);
      report.migrations = migRes.rows.map((r) => r.id);
    }

    // 4. User table columns
    const userColsRes = await client.query<{ column_name: string; data_type: string; is_nullable: string }>(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'User'
      ORDER BY ordinal_position
    `);
    report.userColumns = userColsRes.rows;

    // 5. UserRole enum values
    try {
      const roleRes = await client.query<{ unnest: string }>(`SELECT unnest(enum_range(NULL::"UserRole")) as unnest`);
      report.userRoleEnumValues = roleRes.rows.map((r) => r.unnest);
    } catch {
      report.userRoleEnumValues = ["(enum not found)"];
    }

    // 6. UserStatus enum values
    try {
      const statusRes = await client.query<{ unnest: string }>(`SELECT unnest(enum_range(NULL::"UserStatus")) as unnest`);
      report.userStatusEnumValues = statusRes.rows.map((r) => r.unnest);
    } catch {
      report.userStatusEnumValues = ["(enum not found)"];
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
