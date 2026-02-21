import { pgSchema, pgTable } from "drizzle-orm/pg-core";
import { getResolvedSchema } from "@/server/db/schemaLock";

// Production: always public. Local/test: may use 8fold_test via ?schema=8fold_test.
// No dynamic schema in production build.
export const DB_SCHEMA = getResolvedSchema();
// drizzle-orm forbids pgSchema("public") because Postgres uses public by default.
// When we're on public, use pgTable() (default schema) under the same `.table()` callsite.
//
// TypeScript note: both `pgSchema(...).table` and `pgTable` are compatible at runtime,
// but their generic types don't unify cleanly. We export a single `.table()` shape.
export const dbSchema = (DB_SCHEMA === "public" ? { table: pgTable } : pgSchema(DB_SCHEMA)) as unknown as {
  table: typeof pgTable;
};

