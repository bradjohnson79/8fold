import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

export function getTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error("Missing DATABASE_URL_TEST (required for tests)");
  }
  return url;
}

export function createTestDb(): { db: ReturnType<typeof drizzle>; pool: pg.Pool } {
  const connectionString = getTestDatabaseUrl();
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool);
  return { db, pool };
}

