/**
 * Backfill User.email for admin actor rows (authUserId = 'admin:...').
 * Admin actors are created by adminSession but may have null email if created before sync fix.
 *
 * Run: pnpm exec tsx apps/api/scripts/backfill-admin-user-emails.ts
 */
import path from "node:path";
import { db } from "@/server/db/drizzle";
import { sql } from "drizzle-orm";

async function main() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(process.cwd(), "apps/api/.env.local") });

  const result = await db.execute(sql`
    UPDATE "User" u
    SET "email" = au."email"
    FROM "AdminUser" au
    WHERE u."authUserId" = 'admin:' || au."email"
      AND (u."email" IS NULL OR u."email" != au."email")
  `);

  const rowCount = (result as { rowCount?: number })?.rowCount ?? 0;
  // eslint-disable-next-line no-console
  console.log(`Updated ${rowCount} admin actor User rows with email from AdminUser.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
