/**
 * Startup schema verification guard.
 * Verifies required columns exist in public."User".
 * Throws if any missing → fail fast, prevent server from starting.
 */
import { sql } from "drizzle-orm";
import { db } from "./drizzle";
import { getResolvedSchema, getDatabaseForLog } from "./schemaLock";

const REQUIRED_USER_COLUMNS = ["id", "clerkUserId", "role", "email", "phoneNumber", "status"] as const;

export async function verifyPublicUserSchema(): Promise<void> {
  if (!process.env.DATABASE_URL) return; // Skip during build or when DB not configured

  // Always verify public."User" — production uses public; fail fast on drift
  const res = await db.execute<{ column_name: string }>(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User'
  `);

  const rows = (res as { rows?: { column_name: string }[] })?.rows ?? [];
  const columns = new Set(rows.map((r) => r.column_name));

  const missing: string[] = [];
  for (const col of REQUIRED_USER_COLUMNS) {
    if (!columns.has(col)) missing.push(col);
  }

  if (missing.length > 0) {
    const msg = `SCHEMA_MISMATCH_FATAL: public."User" missing required columns: ${missing.join(", ")}`;
    // eslint-disable-next-line no-console
    console.error(msg);
    throw new Error(msg);
  }
}

/** Log SCHEMA_LOCK once at boot. Call from instrumentation. */
export function logSchemaLock(): void {
  const schema = getResolvedSchema();
  const database = getDatabaseForLog();
  const env = process.env.NODE_ENV ?? "unknown";
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      SCHEMA_LOCK: {
        database,
        schema,
        environment: env,
      },
    })
  );
}
