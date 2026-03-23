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
import { runLgsOutreachScheduler } from "../src/services/lgs/lgsOutreachSchedulerService";
import { runFollowupEngine } from "../src/services/lgs/lgsFollowupService";
import { runJobPosterQueueCycle } from "../src/services/lgs/jobPosterOutreachService";
import { rescoreDirtyLeadPriority } from "../src/services/lgs/priorityScoringService";
import { runAutoAssignmentCycle } from "../src/services/lgs/autoAssignmentService";
import { runOutreachAutomationCycle } from "../src/services/lgs/outreachAutomationService";
import { runWarmupCycle } from "./lgs-warmup-worker";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local") });

async function runScheduler() {
  try {
    console.log("[LGS Outreach] Running shared warmup cycle...");
    await runWarmupCycle();

    const assignment = await runAutoAssignmentCycle();
    if (
      assignment.contractor.scanned > 0 || assignment.jobs.scanned > 0 ||
      assignment.contractor.assigned > 0 || assignment.jobs.assigned > 0 ||
      assignment.contractor.fallback_created > 0 || assignment.jobs.fallback_created > 0
    ) {
      console.log("[LGS AutoAssign]", assignment);
    }

    const automation = await runOutreachAutomationCycle();
    if (
      automation.contractor.generated > 0 || automation.jobs.generated > 0 ||
      automation.contractor.queued > 0 || automation.jobs.queued > 0 ||
      automation.contractor.failed_generation > 0 || automation.jobs.failed_generation > 0
    ) {
      console.log("[LGS Outreach Automation]", automation);
    }

    const contractor = await runLgsOutreachScheduler();
    if (contractor.sent > 0 || contractor.failed > 0) {
      console.log(`[LGS Outreach] contractor sent=${contractor.sent} failed=${contractor.failed}`);
    }

    const jobs = await runJobPosterQueueCycle();
    if (jobs.sent > 0 || jobs.failed > 0) {
      console.log(`[LGS Outreach] job-posters processed=${jobs.processed} sent=${jobs.sent} failed=${jobs.failed}`);
    }
  } catch (err) {
    console.error("[LGS Outreach] scheduler error:", err);
  }
}

function runFollowups() {
  runFollowupEngine()
    .then((r) => {
      if (r.generated > 0 || r.paused > 0 || r.errors > 0) {
        console.log(`[LGS Follow-up] processed=${r.processed} generated=${r.generated} paused=${r.paused} errors=${r.errors}`);
      }
    })
    .catch((err) => {
      console.error("[LGS Follow-up] engine error:", err);
    });
}

function runRescore() {
  rescoreDirtyLeadPriority(500)
    .then((updated) => {
      if (updated > 0) {
        console.log(`[LGS Scoring] rescored ${updated} dirty leads`);
      }
    })
    .catch((err) => {
      console.error("[LGS Scoring] rescore error:", err);
    });
}

// Send scheduler: every minute
cron.schedule("*/1 * * * *", runScheduler, { timezone: "America/Los_Angeles" });
// Follow-up engine: every 5 minutes
cron.schedule("*/5 * * * *", runFollowups, { timezone: "America/Los_Angeles" });
// Dirty-lead rescore: every 10 minutes
cron.schedule("*/10 * * * *", runRescore, { timezone: "America/Los_Angeles" });

runScheduler();

console.log("[LGS Outreach] Worker started. Cron: */1 * * * * (every minute)");

process.on("SIGINT", () => {
  console.log("[LGS Outreach] Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[LGS Outreach] Shutting down...");
  process.exit(0);
});
