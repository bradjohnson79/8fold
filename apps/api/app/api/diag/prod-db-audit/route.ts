/**
 * Production DB + schema verification (read-only).
 * GET /api/diag/prod-db-audit
 *
 * Returns: DATABASE_URL (masked), schema param, runtime schema, User table locations, User columns.
 * No destructive operations. Audit only.
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { DB_SCHEMA } from "@/db/schema/_dbSchema";

function maskDatabaseUrl(url: string | undefined): string {
  if (!url || typeof url !== "string") return "(not set)";
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    return u.toString();
  } catch {
    return "(invalid url)";
  }
}

function parseDbUrl(url: string | undefined): { host: string; database: string; schemaParam: string | null } {
  if (!url) return { host: "", database: "", schemaParam: null };
  try {
    const u = new URL(url);
    const schemaParam = u.searchParams.get("schema");
    const host = u.hostname;
    const database = u.pathname?.replace(/^\//, "") ?? "";
    return { host, database, schemaParam };
  } catch {
    return { host: "", database: "", schemaParam: null };
  }
}

export async function GET() {
  try {
    const rawUrl = process.env.DATABASE_URL;
    const masked = maskDatabaseUrl(rawUrl);
    const { host, database, schemaParam } = parseDbUrl(rawUrl);

    // Runtime introspection (uses same connection as app)
    const dbRes = await db.execute<{ current_database: string }>(sql`SELECT current_database() as current_database`);
    const schemaRes = await db.execute<{ current_schema: string }>(sql`SELECT current_schema() as current_schema`);
    const tablesRes = await db.execute<{ table_schema: string; table_name: string }>(sql`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name = 'User'
      ORDER BY table_schema
    `);
    const colsRes = await db.execute<{ table_schema: string; column_name: string; ordinal_position: number }>(sql`
      SELECT table_schema, column_name, ordinal_position
      FROM information_schema.columns
      WHERE table_name = 'User'
      ORDER BY table_schema, ordinal_position
    `);

    const databaseName = (dbRes as any)?.rows?.[0]?.current_database ?? null;
    const currentSchema = (schemaRes as any)?.rows?.[0]?.current_schema ?? null;
    const userTableSchemas = ((tablesRes as any)?.rows ?? []).map((r: any) => r.table_schema);
    const userColumnsBySchema: Record<string, string[]> = {};
    for (const r of (colsRes as any)?.rows ?? []) {
      const s = r.table_schema;
      if (!userColumnsBySchema[s]) userColumnsBySchema[s] = [];
      userColumnsBySchema[s].push(r.column_name);
    }

    const audit = {
      PROD_DB_AUDIT: {
        database: databaseName,
        currentSchema,
        dbSchemaFromUrl: DB_SCHEMA,
        dbUrlSchemaParam: schemaParam,
        dbUrlHost: host,
        dbUrlDatabase: database,
        dbUrlMasked: masked,
        userTableSchemas,
        userColumnsBySchema,
        phoneNumberExists: Object.values(userColumnsBySchema).some((cols) => cols.includes("phoneNumber")),
        statusExists: Object.values(userColumnsBySchema).some((cols) => cols.includes("status")),
        clerkUserIdExists: Object.values(userColumnsBySchema).some((cols) => cols.includes("clerkUserId")),
      },
    };

    // eslint-disable-next-line no-console
    console.log("PROD_DB_AUDIT::", JSON.stringify(audit, null, 2));

    return NextResponse.json(audit);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error("PROD_DB_AUDIT_ERROR::", msg);
    return NextResponse.json(
      { ok: false, error: "audit_failed", message: msg },
      { status: 500 },
    );
  }
}
