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

// Temporary diagnostic: log parsed host (no credentials). Remove after env fix.
(function logDbUrlDiagnostic() {
  try {
    const u = new URL(connectionString);
    const parsedHost = u.hostname || "(empty)";
    // eslint-disable-next-line no-console
    console.info("DB_RUNTIME_HOST::", parsedHost);
    const dbPath = u.pathname?.replace(/^\//, "").split("?")[0];
    const validation = {
      hasProtocol: /^postgres(ql)?:\/\//i.test(connectionString),
      hasHost: !!parsedHost && parsedHost !== "(empty)",
      parsedHost,
      hasPort: !!u.port,
      hasDatabase: !!dbPath,
      hasSchemaParam: u.searchParams.get("schema") !== null,
    };
    // eslint-disable-next-line no-console
    console.info("DATABASE_URL_VALIDATION::", JSON.stringify(validation));
  } catch {
    // eslint-disable-next-line no-console
    console.info("DB_RUNTIME_HOST::", "(parse failed)");
    // eslint-disable-next-line no-console
    console.info("DATABASE_URL_VALIDATION::", JSON.stringify({ hasProtocol: false, hasHost: false, parsedHost: "(parse failed)", hasPort: false, hasDatabase: false, hasSchemaParam: false }));
  }
})();

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

