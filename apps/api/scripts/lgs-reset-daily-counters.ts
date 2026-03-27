/**
 * LGS: Reset sender_pool.sent_today at midnight Pacific.
 * Run via cron at 0 0 * * * (midnight) or external scheduler.
 *
 * IMPORTANT: Only resets senders NOT actively warming.
 * Senders with warmup_status = 'warming' use rolling 24-hour
 * windows managed by the warmup worker — they must NOT be reset here.
 *
 *   DOTENV_CONFIG_PATH=apps/api/.env.local pnpm -C apps/api run lgs:reset-counters
 */
import path from "node:path";
import dotenv from "dotenv";
import { or, eq, isNull } from "drizzle-orm";
import { db } from "../db/drizzle";
import { senderPool } from "../db/schema/directoryEngine";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local") });

async function main() {
  await db
    .update(senderPool)
    .set({
      sentToday: 0,
      outreachSentToday: 0,
      warmupSentToday: 0,
    })
    .where(
      or(
        eq(senderPool.warmupStatus, "not_started"),
        eq(senderPool.warmupStatus, "complete"),
        eq(senderPool.warmupStatus, "disabled"),
        isNull(senderPool.warmupStatus)
      )
    );

  console.log("[LGS Reset] Counters reset for outreach-only senders (not_started / complete / disabled / null).");
  console.log("[LGS Reset] Warmup-managed senders (warming) untouched — rolling 24h applies.");
}

main().catch((e) => {
  console.error("[LGS Reset] error:", e);
  process.exit(1);
});
