/**
 * LGS Email Verification Worker.
 * Runs every 5 minutes. Processes queued email verification jobs for both pipelines.
 *
 *   DOTENV_CONFIG_PATH=apps/api/.env.local pnpm -C apps/api run lgs:verification:worker
 */
import path from "node:path";
import cron from "node-cron";
import dotenv from "dotenv";
import { runEmailVerificationWorker } from "../src/services/lgs/emailVerificationService";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local") });

function runCycle() {
  runEmailVerificationWorker()
    .then((result) => {
      if (result.processed > 0) {
        console.log(
          `[LGS Verification] processed=${result.processed} completed=${result.completed} failed=${result.failed}`
        );
      }
    })
    .catch((err) => {
      console.error("[LGS Verification] error:", err);
    });
}

cron.schedule("*/5 * * * *", runCycle, { timezone: "America/Los_Angeles" });
runCycle();

console.log("[LGS Verification] Worker started. Cron: */5 * * * * (every 5 min)");

process.on("SIGINT", () => {
  console.log("[LGS Verification] Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[LGS Verification] Shutting down...");
  process.exit(0);
});
