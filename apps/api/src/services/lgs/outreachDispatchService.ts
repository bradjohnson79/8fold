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

const OUTREACH_BATCH_SIZE = 20;

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

  const initialPipeline = await selectPipelineToProcess();
  if (!initialPipeline) {
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

  let selectedPipeline: "contractor" | "jobs" | null = initialPipeline;
  let sent = 0;
  let failed = 0;
  let blocked_reason: "outside_send_window" | undefined;
  let next_send_window: Date | undefined;

  for (let processed = 0; processed < OUTREACH_BATCH_SIZE; processed++) {
    const pipeline = processed === 0 ? initialPipeline : await selectPipelineToProcess();
    if (!pipeline) break;

    const cycleResult = pipeline === "contractor"
      ? await runLgsOutreachScheduler()
      : await runJobPosterQueueCycle();

    selectedPipeline ??= pipeline;
    sent += cycleResult.sent;
    failed += cycleResult.failed;

    if (cycleResult.blockedReason) {
      blocked_reason = cycleResult.blockedReason;
      next_send_window = cycleResult.nextSendWindow;
      break;
    }

    if (cycleResult.sent === 0 && cycleResult.failed === 0) {
      break;
    }
  }

  return {
    enabled,
    contractorQueued: contractorQueueResult.queued,
    contractorQueueSkipped: contractorQueueResult.skipped,
    jobsQueued: jobsQueueResult.queued,
    jobsQueueSkipped: jobsQueueResult.skipped,
    selectedPipeline,
    sent,
    failed,
    blocked_reason,
    next_send_window,
  };
}

export async function runReplyProcessor() {
  return runGmailInboundCycle();
}
