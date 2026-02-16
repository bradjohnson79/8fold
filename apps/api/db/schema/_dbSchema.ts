import { pgSchema } from "drizzle-orm/pg-core";

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
export const dbSchema = pgSchema(DB_SCHEMA);

