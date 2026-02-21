import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { ensureProductionSchema } from "./schemaLock";
import { logSchemaLock, verifyPublicUserSchema } from "./verifySchemaGuard";

// Single source of DB truth:
// This is the ONLY file allowed to create a Pool and call drizzle().
ensureProductionSchema();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required (apps/api/src/server/db/drizzle.ts)');
}

const { Pool } = pg;
export const pool = new Pool({ connectionString });
export const db = drizzle(pool);

// One-time boot: log SCHEMA_LOCK and verify public."User" schema (runs on first db use)
let schemaGuardDone = false;
async function runSchemaGuardOnce() {
  if (schemaGuardDone) return;
  schemaGuardDone = true;
  logSchemaLock();
  await verifyPublicUserSchema();
}
runSchemaGuardOnce().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("SCHEMA_GUARD_ERROR::", e);
  throw e;
});

