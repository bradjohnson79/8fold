import path from "node:path";
import { pathToFileURL } from "node:url";
import cron from "node-cron";
import dotenv from "dotenv";
import { runGmailInboundCycle } from "../src/services/lgs/gmailInboundService";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local") });

async function runScheduler() {
  try {
    await runGmailInboundCycle();
  } catch (error) {
    console.error("[LGS Inbound] scheduler error:", error);
  }
}

const isEntrypoint = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  cron.schedule("*/5 * * * *", runScheduler, { timezone: "America/Los_Angeles" });

  void runScheduler();

  console.log("[LGS Inbound] Worker started. Cron: */5 * * * * (every 5 minutes)");

  process.on("SIGINT", () => {
    console.log("[LGS Inbound] Shutting down...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("[LGS Inbound] Shutting down...");
    process.exit(0);
  });
}
