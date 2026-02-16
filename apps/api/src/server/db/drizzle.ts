import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

// Single source of DB truth:
// This is the ONLY file allowed to create a Pool and call drizzle().
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required (apps/api/src/server/db/drizzle.ts)');
}

const { Pool } = pg;
export const pool = new Pool({ connectionString });
export const db = drizzle(pool);

