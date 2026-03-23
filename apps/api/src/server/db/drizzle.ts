import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { ensureProductionSchema } from "./schemaLock";
import { logSchemaLock, verifyLgsSchema, verifyPublicUserSchema } from "./verifySchemaGuard";

ensureProductionSchema();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required (apps/api/src/server/db/drizzle.ts)');
}

const poolMaxRaw = process.env.POOL_MAX ? parseInt(process.env.POOL_MAX, 10) : 1;
const resolvedPoolMax = Number.isNaN(poolMaxRaw) ? 1 : Math.max(1, Math.min(poolMaxRaw, 5));

export const pool = new Pool({
  connectionString,
  max: resolvedPoolMax,
});

export const db = drizzle({ client: pool });

let schemaGuardDone = false;
async function runSchemaGuardOnce() {
  if (schemaGuardDone) return;
  schemaGuardDone = true;
  await pool.query("select 1");
  logSchemaLock();
  await verifyPublicUserSchema(pool);
  await verifyLgsSchema(pool);
}

runSchemaGuardOnce().catch((e) => {
  console.error("SCHEMA_GUARD_ERROR::", e);
  throw e;
});
