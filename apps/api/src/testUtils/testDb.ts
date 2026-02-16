import { db, pool } from "@/server/db/drizzle";

export function createTestDb(): { db: typeof db; pool: typeof pool } {
  return { db, pool };
}

