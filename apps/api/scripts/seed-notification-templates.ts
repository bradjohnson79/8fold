/**
 * Seeds the 9 priority notification templates into the DB.
 * Safe to run multiple times — skips types that already have a DB record.
 *
 * Run:
 *   pnpm -C apps/api exec tsx scripts/seed-notification-templates.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

import { seedPriorityTemplates } from "../src/services/v4/notifications/notificationTemplateService";

async function main() {
  console.log("[seed] Seeding priority notification templates...");
  await seedPriorityTemplates("SYSTEM_SEED");
  console.log("[seed] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] FATAL:", err);
  process.exit(1);
});
