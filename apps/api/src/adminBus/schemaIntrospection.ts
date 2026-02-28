import { sql } from "drizzle-orm";
import { DB_SCHEMA } from "@/db/schema/_dbSchema";
import { db } from "@/src/adminBus/db";

export type DbIdentity = {
  database: string | null;
  schema: string | null;
  hostMasked: string | null;
  environment: string;
};

function maskHost(rawHost: string): string {
  const h = String(rawHost || "").trim();
  if (!h) return "";
  const parts = h.split(".");
  if (parts.length <= 2) return "***";
  return `***.${parts.slice(-2).join(".")}`;
}

export async function getDbIdentity(): Promise<DbIdentity> {
  const dbRes = await db.execute<{ current_database: string }>(sql`select current_database() as current_database`);
  const schemaRes = await db.execute<{ current_schema: string }>(sql`select current_schema() as current_schema`);

  let hostMasked: string | null = null;
  try {
    const raw = String(process.env.DATABASE_URL ?? "").trim();
    if (raw) {
      const u = new URL(raw);
      hostMasked = maskHost(u.hostname);
    }
  } catch {
    hostMasked = null;
  }

  return {
    database: (dbRes as any)?.rows?.[0]?.current_database ?? null,
    schema: (schemaRes as any)?.rows?.[0]?.current_schema ?? DB_SCHEMA,
    hostMasked,
    environment: String(process.env.NODE_ENV ?? "development"),
  };
}

export async function tableExists(tableName: string): Promise<boolean> {
  const schema = DB_SCHEMA || "public";
  const qualified = `${schema}.${tableName}`;
  const res = await db.execute<{ exists: boolean }>(sql`select to_regclass(${qualified}) is not null as exists`);
  return Boolean((res as any)?.rows?.[0]?.exists);
}

export async function getTableCount(tableName: string): Promise<number> {
  const exists = await tableExists(tableName);
  if (!exists) return 0;

  const schema = DB_SCHEMA || "public";
  const qSchema = `"${schema.replace(/"/g, "")}"`;
  const qTable = `"${tableName.replace(/"/g, "")}"`;
  const raw = await db.execute(sql.raw(`select count(*)::int as count from ${qSchema}.${qTable}`));
  return Number((raw as any)?.rows?.[0]?.count ?? 0);
}

export async function getCoreTableCounts() {
  const coreTables = [
    "User",
    "jobs",
    "job_posters",
    "contractor_accounts",
    "routers",
    "v4_contractor_job_invites",
    "Contractor",
  ] as const;

  const entries = await Promise.all(
    coreTables.map(async (table) => {
      const exists = await tableExists(table);
      const rowCount = exists ? await getTableCount(table) : 0;
      return [table, { exists, rowCount }] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export async function listSafeTablesWithCounts(tableNames: string[]) {
  const rows = await Promise.all(
    tableNames.map(async (tableName) => {
      const exists = await tableExists(tableName);
      const rowCount = exists ? await getTableCount(tableName) : 0;
      return { tableName, exists, rowCount };
    }),
  );

  return rows;
}

export async function getRoleDistribution() {
  const rows = await db.execute<{ role: string; count: number }>(sql`
    select role::text as role, count(*)::int as count
    from "User"
    group by role
    order by role asc
  `);
  const list = (rows as any)?.rows ?? [];
  return list.map((r: any) => ({ role: String(r.role), count: Number(r.count ?? 0) }));
}
