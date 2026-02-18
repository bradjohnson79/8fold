import { pgSchema, pgTable } from "drizzle-orm/pg-core";

// Prisma uses `?schema=...` in DATABASE_URL to set the Postgres schema.
// Drizzle schemas should point at the same schema to mirror existing tables.
function getSchemaName(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

export const DB_SCHEMA = getSchemaName();
// drizzle-orm forbids pgSchema("public") because Postgres uses public by default.
// When we're on public, use pgTable() (default schema) under the same `.table()` callsite.
//
// TypeScript note: both `pgSchema(...).table` and `pgTable` are compatible at runtime,
// but their generic types don't unify cleanly. We export a single `.table()` shape.
export const dbSchema = (DB_SCHEMA === "public" ? { table: pgTable } : pgSchema(DB_SCHEMA)) as unknown as {
  table: typeof pgTable;
};

