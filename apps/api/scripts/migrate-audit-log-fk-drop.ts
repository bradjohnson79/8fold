/**
 * AuditLog FK constraint removal — production-safe, idempotent.
 *
 * Root Cause:
 *   The Prisma-era `AuditLog` table has a FK constraint:
 *     `AuditLog_actorAdminUserId_fkey` → `AdminUser.id`
 *
 *   The new admin auth system uses the `admins` table (not `AdminUser`).
 *   Admin UUIDs from `admins.id` are NOT present in `AdminUser`, so every
 *   INSERT into AuditLog with an actorAdminUserId throws:
 *     "violates foreign key constraint AuditLog_actorAdminUserId_fkey"
 *
 *   This caused all admin cancellation actions (approve, refund, payout, suspend)
 *   to silently fail — the transaction rolled back, returning 500, and the
 *   admin UI silently swallowed the error via its empty catch block.
 *
 * Fix:
 *   Drop the stale FK constraint. The actorAdminUserId column is retained
 *   for audit traceability; it simply no longer has DB-level FK enforcement.
 *   The new `admins` table ID is stored there instead of `AdminUser` ID.
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/migrate-audit-log-fk-drop.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

import { Client } from "pg";

async function main() {
  const DATABASE_URL = String(process.env.DATABASE_URL ?? "").trim();
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("[migrate-audit-log-fk-drop] Connected ✓");

  // Drop the stale Prisma FK — idempotent via IF EXISTS
  await client.query(`ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_actorAdminUserId_fkey"`);
  console.log('[migrate-audit-log-fk-drop] Dropped AuditLog_actorAdminUserId_fkey ✓');

  // Verify the constraint is gone
  const { rows } = await client.query(`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_name = 'AuditLog'
      AND constraint_name = 'AuditLog_actorAdminUserId_fkey'
  `);
  if (rows.length > 0) {
    throw new Error('[migrate-audit-log-fk-drop] Constraint still exists after drop — investigate manually');
  }
  console.log('[migrate-audit-log-fk-drop] Verified: constraint no longer exists ✓');

  await client.end();
  console.log('\n[migrate-audit-log-fk-drop] Migration complete.');
  console.log('  The AuditLog.actorAdminUserId column now accepts IDs from admins table.');
  console.log('  All admin cancellation routes (approve, refund, payout, suspend) will work correctly.');
}

main().catch((err) => {
  console.error('[migrate-audit-log-fk-drop] FATAL:', err);
  process.exit(1);
});
