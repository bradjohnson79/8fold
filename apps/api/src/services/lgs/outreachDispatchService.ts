import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  jobPosterEmailQueue,
  lgsOutreachQueue,
  lgsWorkerHealth,
} from "@/db/schema/directoryEngine";
import { runGmailInboundCycle } from "./gmailInboundService";
import { runJobPosterQueueCycleWithOptions } from "./jobPosterOutreachService";
import { runLgsOutreachScheduler } from "./lgsOutreachSchedulerService";
import {
  queueApprovedContractorMessages,
  queueApprovedJobPosterMessages,
} from "./outreachAutomationService";
import { LGS_GMAIL_INBOUND_PIPELINES } from "./gmailInboundConfig";

export type OutreachDispatcherResult = {
  enabled: boolean;
  contractorQueued: number;
  contractorQueueSkipped: number;
  jobsQueued: number;
  jobsQueueSkipped: number;
  selectedPipeline: "contractor" | "jobs" | null;
  sent: number;
  failed: number;
  contractorSentToday: number;
  jobPosterSentToday: number;
  lastEmailTypeSent: "contractor" | "job_poster" | null;
  nextEligibleAt?: string | null;
  blocked_reason?: "outside_send_window";
  next_send_window?: Date;
};

const DISPATCH_WORKER_NAME = "outreach_cron";
const PER_PIPELINE_DAILY_TARGET = 100;
const BASE_INTERVAL_MS = 180 * 1000;

type SchedulerEmailType = "contractor" | "job_poster";
type SchedulerState = {
  ptDateKey: string;
  contractorSentToday: number;
  jobPosterSentToday: number;
  lastEmailTypeSent: SchedulerEmailType | null;
  nextEligibleAt: string | null;
  contractorSenderIndex: number;
  jobPosterSenderIndex: number;
  stoppedForDay: boolean;
};

const DEFAULT_STATE: SchedulerState = {
  ptDateKey: "",
  contractorSentToday: 0,
  jobPosterSentToday: 0,
  lastEmailTypeSent: null,
  nextEligibleAt: null,
  contractorSenderIndex: 0,
  jobPosterSenderIndex: 0,
  stoppedForDay: false,
};

function isOutreachEnabled() {
  const value = process.env.OUTREACH_ENABLED?.trim().toLowerCase();
  if (!value) return true;
  return !["0", "false", "off", "no"].includes(value);
}

export function randomJitterMs() {
  const magnitudeMs = (Math.floor(Math.random() * 21) + 10) * 1000;
  const sign = Math.random() < 0.5 ? -1 : 1;
  return BASE_INTERVAL_MS + sign * magnitudeMs;
}

export function getPacificParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    weekday: read("weekday"),
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    second: Number(read("second")),
  };
}

export function pacificTimeToUtc(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}) {
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "shortOffset",
  }).formatToParts(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0)))
    .find((part) => part.type === "timeZoneName")?.value ?? "GMT-8";
  const match = offsetName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  const sign = match?.[1] === "-" ? -1 : 1;
  const hours = Number(match?.[2] ?? 8);
  const minutes = Number(match?.[3] ?? 0);
  const offsetMinutes = sign * (hours * 60 + minutes);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - offsetMinutes * 60 * 1000);
}

export function getPacificDateKey(date = new Date()) {
  const parts = getPacificParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function isBusinessWindowOpen(date = new Date()) {
  const parts = getPacificParts(date);
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= 8 * 60 + 30 && minutes < 18 * 60 + 30;
}

export function getNextBusinessWindow(date = new Date()) {
  let cursor = new Date(date);
  let parts = getPacificParts(cursor);
  const currentMinutes = parts.hour * 60 + parts.minute;
  if (parts.weekday === "Sat") {
    cursor.setUTCDate(cursor.getUTCDate() + 2);
    parts = getPacificParts(cursor);
  } else if (parts.weekday === "Sun") {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    parts = getPacificParts(cursor);
  } else if (currentMinutes >= 18 * 60 + 30) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    parts = getPacificParts(cursor);
  }

  while (parts.weekday === "Sat" || parts.weekday === "Sun") {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    parts = getPacificParts(cursor);
  }

  return pacificTimeToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 8,
    minute: 30,
    second: 0,
  });
}

export function normalizeState(raw: unknown, dateKey: string): SchedulerState {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const sameDay = String(source.ptDateKey ?? "") === dateKey;
  if (!sameDay) {
    return {
      ...DEFAULT_STATE,
      ptDateKey: dateKey,
    };
  }
  return {
    ptDateKey: dateKey,
    contractorSentToday: Math.max(0, Number(source.contractorSentToday ?? 0) || 0),
    jobPosterSentToday: Math.max(0, Number(source.jobPosterSentToday ?? 0) || 0),
    lastEmailTypeSent:
      source.lastEmailTypeSent === "contractor" || source.lastEmailTypeSent === "job_poster"
        ? source.lastEmailTypeSent
        : null,
    nextEligibleAt: String(source.nextEligibleAt ?? "").trim() || null,
    contractorSenderIndex: Math.max(0, Number(source.contractorSenderIndex ?? 0) || 0),
    jobPosterSenderIndex: Math.max(0, Number(source.jobPosterSenderIndex ?? 0) || 0),
    stoppedForDay: Boolean(source.stoppedForDay),
  };
}

async function loadSchedulerState(now = new Date()) {
  const [row] = await db
    .select({ configCheckResult: lgsWorkerHealth.configCheckResult })
    .from(lgsWorkerHealth)
    .where(eq(lgsWorkerHealth.workerName, DISPATCH_WORKER_NAME))
    .limit(1);
  return normalizeState((row?.configCheckResult as any)?.schedulerState, getPacificDateKey(now));
}

async function saveSchedulerState(state: SchedulerState) {
  const [existing] = await db
    .select({ id: lgsWorkerHealth.id, configCheckResult: lgsWorkerHealth.configCheckResult })
    .from(lgsWorkerHealth)
    .where(eq(lgsWorkerHealth.workerName, DISPATCH_WORKER_NAME))
    .limit(1);

  const nextConfig = {
    ...((existing?.configCheckResult as Record<string, unknown> | null) ?? {}),
    schedulerState: state,
  };

  await db
    .insert(lgsWorkerHealth)
    .values({
      workerName: DISPATCH_WORKER_NAME,
      configCheckResult: nextConfig as any,
    })
    .onConflictDoUpdate({
      target: lgsWorkerHealth.workerName,
      set: {
        configCheckResult: nextConfig as any,
      },
    });
}

export function nextPreferredType(state: SchedulerState): SchedulerEmailType | null {
  if (state.contractorSentToday >= PER_PIPELINE_DAILY_TARGET && state.jobPosterSentToday >= PER_PIPELINE_DAILY_TARGET) {
    return null;
  }
  if (state.contractorSentToday >= PER_PIPELINE_DAILY_TARGET) return "job_poster";
  if (state.jobPosterSentToday >= PER_PIPELINE_DAILY_TARGET) return "contractor";
  return state.lastEmailTypeSent === "contractor" ? "job_poster" : "contractor";
}

function getPreferredSenderEmail(state: SchedulerState, type: SchedulerEmailType): string | null {
  const senders = type === "contractor"
    ? LGS_GMAIL_INBOUND_PIPELINES.contractor
    : LGS_GMAIL_INBOUND_PIPELINES.jobs;
  if (!senders.length) return null;
  const index = type === "contractor" ? state.contractorSenderIndex : state.jobPosterSenderIndex;
  return senders[index % senders.length] ?? null;
}

function advanceSenderIndex(state: SchedulerState, type: SchedulerEmailType): SchedulerState {
  return type === "contractor"
    ? { ...state, contractorSenderIndex: state.contractorSenderIndex + 1 }
    : { ...state, jobPosterSenderIndex: state.jobPosterSenderIndex + 1 };
}

function setNextEligibleAt(state: SchedulerState, now = new Date()): SchedulerState {
  return {
    ...state,
    nextEligibleAt: new Date(now.getTime() + randomJitterMs()).toISOString(),
  };
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
      contractorSentToday: 0,
      jobPosterSentToday: 0,
      lastEmailTypeSent: null,
    };
  }

  const now = new Date();
  let state = await loadSchedulerState(now);

  if (!isBusinessWindowOpen(now)) {
    const next_send_window = getNextBusinessWindow(now);
    state = {
      ...state,
      stoppedForDay: false,
    };
    await saveSchedulerState(state);
    return {
      enabled,
      contractorQueued: contractorQueueResult.queued,
      contractorQueueSkipped: contractorQueueResult.skipped,
      jobsQueued: jobsQueueResult.queued,
      jobsQueueSkipped: jobsQueueResult.skipped,
      selectedPipeline: null,
      sent: 0,
      failed: 0,
      contractorSentToday: state.contractorSentToday,
      jobPosterSentToday: state.jobPosterSentToday,
      lastEmailTypeSent: state.lastEmailTypeSent,
      nextEligibleAt: state.nextEligibleAt,
      blocked_reason: "outside_send_window",
      next_send_window,
    };
  }

  if (state.stoppedForDay) {
    return {
      enabled,
      contractorQueued: contractorQueueResult.queued,
      contractorQueueSkipped: contractorQueueResult.skipped,
      jobsQueued: jobsQueueResult.queued,
      jobsQueueSkipped: jobsQueueResult.skipped,
      selectedPipeline: null,
      sent: 0,
      failed: 0,
      contractorSentToday: state.contractorSentToday,
      jobPosterSentToday: state.jobPosterSentToday,
      lastEmailTypeSent: state.lastEmailTypeSent,
      nextEligibleAt: state.nextEligibleAt,
    };
  }

  const nextEligibleAtMs = state.nextEligibleAt ? new Date(state.nextEligibleAt).getTime() : 0;
  if (Number.isFinite(nextEligibleAtMs) && nextEligibleAtMs > Date.now()) {
    return {
      enabled,
      contractorQueued: contractorQueueResult.queued,
      contractorQueueSkipped: contractorQueueResult.skipped,
      jobsQueued: jobsQueueResult.queued,
      jobsQueueSkipped: jobsQueueResult.skipped,
      selectedPipeline: null,
      sent: 0,
      failed: 0,
      contractorSentToday: state.contractorSentToday,
      jobPosterSentToday: state.jobPosterSentToday,
      lastEmailTypeSent: state.lastEmailTypeSent,
      nextEligibleAt: state.nextEligibleAt,
    };
  }

  const preferred = nextPreferredType(state);
  if (!preferred) {
    state = { ...state, stoppedForDay: true };
    await saveSchedulerState(state);
    return {
      enabled,
      contractorQueued: contractorQueueResult.queued,
      contractorQueueSkipped: contractorQueueResult.skipped,
      jobsQueued: jobsQueueResult.queued,
      jobsQueueSkipped: jobsQueueResult.skipped,
      selectedPipeline: null,
      sent: 0,
      failed: 0,
      contractorSentToday: state.contractorSentToday,
      jobPosterSentToday: state.jobPosterSentToday,
      lastEmailTypeSent: state.lastEmailTypeSent,
      nextEligibleAt: state.nextEligibleAt,
    };
  }

  const order: SchedulerEmailType[] = preferred === "contractor"
    ? ["contractor", "job_poster"]
    : ["job_poster", "contractor"];

  let selectedPipeline: "contractor" | "jobs" | null = null;
  let sent = 0;
  let failed = 0;
  let blocked_reason: "outside_send_window" | undefined;
  let next_send_window: Date | undefined;

  for (const type of order) {
    if (type === "contractor" && state.contractorSentToday >= PER_PIPELINE_DAILY_TARGET) continue;
    if (type === "job_poster" && state.jobPosterSentToday >= PER_PIPELINE_DAILY_TARGET) continue;

    const preferredSenderEmail = getPreferredSenderEmail(state, type);
    const cycleResult = type === "contractor"
      ? await runLgsOutreachScheduler({ preferredSenderEmail })
      : await runJobPosterQueueCycleWithOptions({ preferredSenderEmail });

    if (cycleResult.blockedReason) {
      blocked_reason = cycleResult.blockedReason;
      next_send_window = cycleResult.nextSendWindow;
      break;
    }

    if (cycleResult.sent > 0 || cycleResult.failed > 0) {
      state = advanceSenderIndex(state, type);
      selectedPipeline = type === "contractor" ? "contractor" : "jobs";
      sent += cycleResult.sent;
      failed += cycleResult.failed;
      if (cycleResult.sent > 0) {
        state = {
          ...setNextEligibleAt(state, now),
          contractorSentToday: type === "contractor" ? state.contractorSentToday + 1 : state.contractorSentToday,
          jobPosterSentToday: type === "job_poster" ? state.jobPosterSentToday + 1 : state.jobPosterSentToday,
          lastEmailTypeSent: type,
          stoppedForDay: false,
        };
      } else {
        state = {
          ...setNextEligibleAt(state, now),
          stoppedForDay: false,
        };
      }
      break;
    }
  }

  if (!selectedPipeline && !blocked_reason) {
    state = {
      ...state,
      stoppedForDay: true,
      nextEligibleAt: null,
    };
  }

  await saveSchedulerState(state);

  return {
    enabled,
    contractorQueued: contractorQueueResult.queued,
    contractorQueueSkipped: contractorQueueResult.skipped,
    jobsQueued: jobsQueueResult.queued,
    jobsQueueSkipped: jobsQueueResult.skipped,
    selectedPipeline,
    sent,
    failed,
    contractorSentToday: state.contractorSentToday,
    jobPosterSentToday: state.jobPosterSentToday,
    lastEmailTypeSent: state.lastEmailTypeSent,
    nextEligibleAt: state.nextEligibleAt,
    blocked_reason,
    next_send_window,
  };
}

export async function runReplyProcessor() {
  return runGmailInboundCycle();
}
