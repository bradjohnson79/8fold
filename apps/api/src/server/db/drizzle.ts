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

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const DB_CONNECTION_TIMEOUT_MS = parsePositiveInt(process.env.DB_CONNECTION_TIMEOUT_MS, 5000);
const DB_QUERY_TIMEOUT_MS = parsePositiveInt(process.env.DB_QUERY_TIMEOUT_MS, 10000);
const DB_STATEMENT_TIMEOUT_MS = parsePositiveInt(process.env.DB_STATEMENT_TIMEOUT_MS, 10000);
const DB_IDLE_TIMEOUT_MS = parsePositiveInt(process.env.DB_IDLE_TIMEOUT_MS, 30000);
const DB_POOL_MAX = parsePositiveInt(process.env.DB_POOL_MAX, 10);

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
export const pool = new Pool({
  connectionString,
  max: DB_POOL_MAX,
  idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
  query_timeout: DB_QUERY_TIMEOUT_MS,
  statement_timeout: DB_STATEMENT_TIMEOUT_MS,
});
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
