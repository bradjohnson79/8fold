/**
 * LGS Outreach Worker.
 * Runs every minute. Sends next eligible contractor_lead via sender pool.
 * Also runs the follow-up engine every 5 minutes.
 *
 *   DOTENV_CONFIG_PATH=apps/api/.env.local pnpm -C apps/api run lgs:outreach:worker
 */
import path from "node:path";
import cron from "node-cron";
import dotenv from "dotenv";
import { runFollowupEngine } from "../src/services/lgs/lgsFollowupService";
import { runOutreachDispatcher, runReplyProcessor } from "../src/services/lgs/outreachDispatchService";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local") });

let schedulerRunning = false;
let followupsRunning = false;
let replySyncRunning = false;

function runScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  runOutreachDispatcher()
    .then((result) => {
      if (result.sent > 0 || result.failed > 0 || result.contractorQueued > 0 || result.jobsQueued > 0) {
        console.log(
          `[LGS Outreach] pipeline=${result.selectedPipeline ?? "none"} sent=${result.sent} failed=${result.failed} contractorQueued=${result.contractorQueued} jobsQueued=${result.jobsQueued}`
        );
      }
    })
    .catch((err) => {
      console.error("[LGS Outreach] scheduler error:", err);
    })
    .finally(() => {
      schedulerRunning = false;
    });
}

function runFollowups() {
  if (followupsRunning) return;
  followupsRunning = true;
  runFollowupEngine()
    .then((r) => {
      if (r.generated > 0 || r.paused > 0 || r.errors > 0) {
        console.log(`[LGS Follow-up] processed=${r.processed} generated=${r.generated} paused=${r.paused} errors=${r.errors}`);
      }
    })
    .catch((err) => {
      console.error("[LGS Follow-up] engine error:", err);
    })
    .finally(() => {
      followupsRunning = false;
    });
}

function runReplySync() {
  if (replySyncRunning) return;
  replySyncRunning = true;
  runReplyProcessor()
    .then((r) => {
      if (r.totalRepliesPosted > 0 || r.totalBouncesPosted > 0 || r.totalDuplicatesSkipped > 0 || r.totalUnmatched > 0) {
        console.log(
          `[LGS Replies] candidates=${r.totalCandidates} replies=${r.totalRepliesPosted} bounces=${r.totalBouncesPosted} duplicates=${r.totalDuplicatesSkipped} unmatched=${r.totalUnmatched}`
        );
      }
    })
    .catch((err) => {
      console.error("[LGS Replies] sync error:", err);
    })
    .finally(() => {
      replySyncRunning = false;
    });
}

// Send scheduler: every minute
cron.schedule("*/1 * * * *", runScheduler, { timezone: "America/Los_Angeles" });
// Follow-up engine: every 5 minutes
cron.schedule("*/5 * * * *", runFollowups, { timezone: "America/Los_Angeles" });
// Reply sync: every 5 minutes
cron.schedule("*/5 * * * *", runReplySync, { timezone: "America/Los_Angeles" });

runScheduler();
runReplySync();

console.log("[LGS Outreach] Worker started. Cron: */1 * * * * (every minute)");

process.on("SIGINT", () => {
  console.log("[LGS Outreach] Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[LGS Outreach] Shutting down...");
  process.exit(0);
});
