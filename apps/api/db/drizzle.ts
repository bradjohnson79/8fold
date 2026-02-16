/**
 * Back-compat DB entrypoint (apps/api).
 *
 * Many route handlers import `db` from `../../../../../db/drizzle` or `@/db/drizzle`.
 * The canonical DB construction remains `src/server/db/drizzle.ts`.
 */

export { db, pool } from "../src/server/db/drizzle";

