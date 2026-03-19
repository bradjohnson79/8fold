import path from "node:path";
import dotenv from "dotenv";
import { runWarmupWorkerCycle, startWarmupWorkerLoop } from "../src/warmup/warmupWorker";

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local"),
});

const RUN_ONCE = process.env.LGS_WARMUP_RUN_ONCE === "1";

async function main() {
  if (RUN_ONCE) {
    const result = await runWarmupWorkerCycle();
    console.log(`[LGS Warmup] Single run complete. processed=${result.processedSenders} sent=${result.sent}`);
    return;
  }

  const stop = startWarmupWorkerLoop();
  console.log("[LGS Warmup] Worker loop started. Interval: 60 seconds");

  const shutdown = () => {
    console.log("[LGS Warmup] Shutting down...");
    stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[LGS Warmup] Worker bootstrap failed:", error);
  process.exit(1);
});
