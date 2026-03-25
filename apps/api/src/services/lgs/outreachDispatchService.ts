import { asc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  jobPosterEmailQueue,
  lgsOutreachQueue,
} from "@/db/schema/directoryEngine";
import { runGmailInboundCycle } from "./gmailInboundService";
import { runJobPosterQueueCycle } from "./jobPosterOutreachService";
import { runLgsOutreachScheduler } from "./lgsOutreachSchedulerService";
import {
  queueApprovedContractorMessages,
  queueApprovedJobPosterMessages,
} from "./outreachAutomationService";

export type OutreachDispatcherResult = {
  enabled: boolean;
  contractorQueued: number;
  contractorQueueSkipped: number;
  jobsQueued: number;
  jobsQueueSkipped: number;
  selectedPipeline: "contractor" | "jobs" | null;
  sent: number;
  failed: number;
  blocked_reason?: "outside_send_window";
  next_send_window?: Date;
};

function isOutreachEnabled() {
  const value = process.env.OUTREACH_ENABLED?.trim().toLowerCase();
  if (!value) return true;
  return !["0", "false", "off", "no"].includes(value);
}

async function getOldestPendingQueue(args: { pipeline: "contractor" | "jobs" }) {
  if (args.pipeline === "contractor") {
    const [row] = await db
      .select({ createdAt: lgsOutreachQueue.createdAt })
      .from(lgsOutreachQueue)
      .where(eq(lgsOutreachQueue.sendStatus, "pending"))
      .orderBy(asc(lgsOutreachQueue.createdAt))
      .limit(1);
    return row?.createdAt ?? null;
  }

  const [row] = await db
    .select({ createdAt: jobPosterEmailQueue.createdAt })
    .from(jobPosterEmailQueue)
    .where(eq(jobPosterEmailQueue.status, "pending"))
    .orderBy(asc(jobPosterEmailQueue.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

async function selectPipelineToProcess(): Promise<"contractor" | "jobs" | null> {
  const [contractorPendingAt, jobsPendingAt] = await Promise.all([
    getOldestPendingQueue({ pipeline: "contractor" }),
    getOldestPendingQueue({ pipeline: "jobs" }),
  ]);

  if (!contractorPendingAt && !jobsPendingAt) return null;
  if (!contractorPendingAt) return "jobs";
  if (!jobsPendingAt) return "contractor";
  return contractorPendingAt <= jobsPendingAt ? "contractor" : "jobs";
}

export async function runOutreachDispatcher(): Promise<OutreachDispatcherResult> {
  const enabled = isOutreachEnabled();
  const [contractorQueueResult, jobsQueueResult] = await Promise.all([
    queueApprovedContractorMessages(200),
    queueApprovedJobPosterMessages(),
  ]);

  if (!enabled) {
    return {
      enabled,
      contractorQueued: contractorQueueResult.queued,
      contractorQueueSkipped: contractorQueueResult.skipped,
      jobsQueued: jobsQueueResult.queued,
      jobsQueueSkipped: jobsQueueResult.skipped,
      selectedPipeline: null,
      sent: 0,
      failed: 0,
    };
  }

  const selectedPipeline = await selectPipelineToProcess();
  if (!selectedPipeline) {
    return {
      enabled,
      contractorQueued: contractorQueueResult.queued,
      contractorQueueSkipped: contractorQueueResult.skipped,
      jobsQueued: jobsQueueResult.queued,
      jobsQueueSkipped: jobsQueueResult.skipped,
      selectedPipeline,
      sent: 0,
      failed: 0,
    };
  }

  const cycleResult = selectedPipeline === "contractor"
    ? await runLgsOutreachScheduler()
    : await runJobPosterQueueCycle();

  return {
    enabled,
    contractorQueued: contractorQueueResult.queued,
    contractorQueueSkipped: contractorQueueResult.skipped,
    jobsQueued: jobsQueueResult.queued,
    jobsQueueSkipped: jobsQueueResult.skipped,
    selectedPipeline,
    sent: cycleResult.sent,
    failed: cycleResult.failed,
    blocked_reason: cycleResult.blockedReason,
    next_send_window: cycleResult.nextSendWindow,
  };
}

export async function runReplyProcessor() {
  return runGmailInboundCycle();
}
