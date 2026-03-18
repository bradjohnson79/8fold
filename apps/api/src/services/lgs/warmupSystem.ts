import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import {
  lgsWarmupActivity,
  lgsWorkerHealth,
  senderPool,
} from "../../../db/schema/directoryEngine";
import { hasGmailTokenForSender } from "./outreachGmailSenderService";
import { DAY_MS, checkSendEligibility } from "./warmupEngine";
import { getDailyLimit, isReadyForOutreach } from "./warmupSchedule";
import { sendTransactionalEmail } from "../../mailer/sendTransactionalEmail";

export const WARMUP_WORKER_NAME = "warmup";
export const WARMUP_RETRY_DELAY_MS = 5 * 60 * 1000;
export const WARMUP_HEARTBEAT_HEALTHY_MS = 10 * 60 * 1000;
export const WARMUP_HEARTBEAT_STALE_MS = 20 * 60 * 1000;
export const WARMUP_ACTIVITY_RECENT_MS = 60 * 60 * 1000;
export const WARMUP_MISSED_SCHEDULE_TOLERANCE_MS = 5 * 60 * 1000;
export const WARMUP_STALE_ALERT_THRESHOLD_MS = 15 * 60 * 1000;
export const WARMUP_CONFIDENCE_WINDOW = 10;
export const WARMUP_CONFIDENCE_FAILURE_FREE_RUNS = 5;

export type WarmupWorkerStatus = "healthy" | "warning" | "stale";
export type WarmupConfidenceLevel = "high" | "medium" | "low";
export type WarmupNextSendState = "scheduled" | "retry_pending" | "due_now" | "rescheduling" | "paused" | "not_scheduled";
export type WarmupSenderRecord = typeof senderPool.$inferSelect;
export type WarmupActivityRecord = typeof lgsWarmupActivity.$inferSelect;
export type WarmupWorkerRecord = typeof lgsWorkerHealth.$inferSelect;

export type WarmupSenderDashboardRow = {
  id: string;
  email: string;
  sender_status: string;
  warmup_status: string;
  dashboard_status: string;
  warmup_day: number;
  daily_limit: number;
  sent_today: number;
  warmup_sent_today: number;
  outreach_sent_today: number;
  remaining_capacity: number;
  current_day_started_at: string | null;
  next_warmup_send_at: string | null;
  next_send_state: WarmupNextSendState;
  last_warmup_sent_at: string | null;
  last_warmup_result: string | null;
  last_warmup_recipient: string | null;
  last_activity_at: string | null;
  last_activity_status: string | null;
  last_activity_recipient: string | null;
  last_activity_type: string | null;
  last_activity_error: string | null;
  is_ready_for_outreach: boolean;
  outreach_enabled: boolean;
  consecutive_failures: number;
  is_delayed: boolean;
  health_score: string | null;
  cooldown_until: string | null;
  is_cooling_down: boolean;
};

export type WarmupSummaryRow = {
  total_senders: number;
  warming_senders: number;
  ready_senders: number;
  outreach_enabled_count: number;
  pending_queue_count: number;
  next_system_warmup_send_at: string | null;
  last_warmup_activity_at: string | null;
  last_warmup_activity: {
    sender_email: string;
    recipient_email: string;
    message_type: string | null;
    status: string;
    error_message: string | null;
    sent_at: string | null;
  } | null;
  worker_last_heartbeat_at: string | null;
  worker_last_run_started_at: string | null;
  worker_last_run_finished_at: string | null;
  worker_last_run_status: string | null;
  worker_status: WarmupWorkerStatus;
  warmup_confidence: WarmupConfidenceLevel;
  warmup_confidence_reason: string;
  recent_success_count: number;
  recent_failure_count: number;
  failure_free_recent_runs: boolean;
  stale_worker_alert_at: string | null;
};

export type WarmupValidationResult = {
  pass: boolean;
  reasons: string[];
  warnings: string[];
  explanation: string | null;
  summary: {
    warming_senders: number;
    senders_with_countdowns: number;
    senders_with_future_countdowns: number;
    overdue_senders: number;
    recent_activity_found: boolean;
    worker_status: WarmupWorkerStatus;
  };
};

type WarmupSenderRepairPlan = {
  updates: Partial<typeof senderPool.$inferInsert>;
  shouldLogMissedSchedule: boolean;
  missedScheduleAt: Date | null;
};

function toIso(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function getWarmupWorkerConfig(workerRow: WarmupWorkerRecord | null | undefined): Record<string, unknown> {
  return asObject(workerRow?.configCheckResult);
}

function describeHeartbeatStatus(status: WarmupWorkerStatus): string {
  if (status === "healthy") return "heartbeat fresh";
  if (status === "warning") return "heartbeat warning";
  return "heartbeat stale";
}

export function getWarmupWorkerStatus(lastHeartbeatAt: Date | null | undefined): WarmupWorkerStatus {
  if (!lastHeartbeatAt) return "stale";

  const ageMs = Date.now() - new Date(lastHeartbeatAt).getTime();
  if (ageMs < WARMUP_HEARTBEAT_HEALTHY_MS) return "healthy";
  if (ageMs < WARMUP_HEARTBEAT_STALE_MS) return "warning";
  return "stale";
}

export function isWarmupManagedStatus(status: string | null | undefined): boolean {
  return status === "warming" || status === "ready";
}

export function getWarmupBudget(input: {
  warmupStatus: string | null | undefined;
  dailyLimit: number | null | undefined;
  warmupSentToday: number | null | undefined;
  outreachSentToday: number | null | undefined;
  outreachEnabled: boolean | null | undefined;
}): number {
  if (!isWarmupManagedStatus(input.warmupStatus)) return 0;

  const dailyLimit = Math.max(0, Number(input.dailyLimit ?? 0));
  const warmupSentToday = Math.max(0, Number(input.warmupSentToday ?? 0));
  const outreachSentToday = Math.max(0, Number(input.outreachSentToday ?? 0));
  const remaining = Math.max(0, dailyLimit - (warmupSentToday + outreachSentToday));

  if (input.outreachEnabled) {
    return Math.min(3, remaining);
  }

  return remaining;
}

export function computeWarmupRetryAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + WARMUP_RETRY_DELAY_MS);
}

export function computeNextWarmupSendAt(input: {
  warmupStatus: string | null | undefined;
  warmupDay: number | null | undefined;
  dailyLimit: number | null | undefined;
  warmupSentToday: number | null | undefined;
  outreachSentToday: number | null | undefined;
  currentDayStartedAt: Date | null | undefined;
  warmupStartedAt?: Date | null | undefined;
  outreachEnabled: boolean | null | undefined;
  cooldownUntil?: Date | null | undefined;
  hasValidToken?: boolean;
  retryFromNow?: boolean;
  now?: Date;
}): Date {
  const now = input.now ?? new Date();

  if (!isWarmupManagedStatus(input.warmupStatus)) {
    return now;
  }

  if (input.retryFromNow) {
    return computeWarmupRetryAt(now);
  }

  const warmupDay = Math.max(1, Number(input.warmupDay ?? 1));
  const currentDayStartedAt = input.currentDayStartedAt ?? input.warmupStartedAt ?? now;
  const dailyLimit = Math.max(
    1,
    Number(input.dailyLimit && input.dailyLimit > 0 ? input.dailyLimit : getDailyLimit(warmupDay))
  );
  const warmupSentToday = Math.max(0, Number(input.warmupSentToday ?? 0));
  const outreachSentToday = Math.max(0, Number(input.outreachSentToday ?? 0));

  if (input.cooldownUntil && new Date(input.cooldownUntil) > now) {
    return new Date(input.cooldownUntil);
  }

  if (input.hasValidToken === false) {
    return computeWarmupRetryAt(now);
  }

  const warmupBudget = getWarmupBudget({
    warmupStatus: input.warmupStatus,
    dailyLimit,
    warmupSentToday,
    outreachSentToday,
    outreachEnabled: input.outreachEnabled,
  });

  if (warmupBudget <= 0 || warmupSentToday >= warmupBudget) {
    const nextDayStart = new Date(new Date(currentDayStartedAt).getTime() + DAY_MS);
    const nextWarmupDay = Math.min(warmupDay + 1, 5);
    const nextDailyLimit = getDailyLimit(nextWarmupDay);
    const nextOutreachEnabled = isReadyForOutreach(nextWarmupDay, nextDailyLimit);
    const nextBudget = getWarmupBudget({
      warmupStatus: "warming",
      dailyLimit: nextDailyLimit,
      warmupSentToday: 0,
      outreachSentToday: 0,
      outreachEnabled: nextOutreachEnabled,
    });
    const nextEligibility = checkSendEligibility({
      currentDayStartedAt: nextDayStart,
      warmupSentToday: 0,
      warmupBudget: nextBudget,
    });
    return nextEligibility.nextSendAt ?? nextDayStart;
  }

  const eligibility = checkSendEligibility({
    currentDayStartedAt,
    warmupSentToday,
    warmupBudget,
  });
  return eligibility.nextSendAt ?? computeWarmupRetryAt(now);
}

export function hasMissedScheduledSend(input: {
  nextWarmupSendAt: Date | null | undefined;
  latestActivityAt: Date | null | undefined;
  now?: Date;
  toleranceMs?: number;
}): boolean {
  if (!input.nextWarmupSendAt) return false;

  const now = input.now ?? new Date();
  const toleranceMs = input.toleranceMs ?? WARMUP_MISSED_SCHEDULE_TOLERANCE_MS;
  const delayedThreshold = new Date(input.nextWarmupSendAt).getTime() + toleranceMs;
  if (now.getTime() <= delayedThreshold) return false;

  return !input.latestActivityAt || new Date(input.latestActivityAt) < new Date(input.nextWarmupSendAt);
}

function hasValidActivityForScheduledWindow(
  activityRows: WarmupActivityRecord[],
  scheduledAt: Date | null | undefined
): boolean {
  if (!scheduledAt) return false;
  const scheduledTime = new Date(scheduledAt).getTime();
  return activityRows.some((row) => row.status !== "missed_schedule" && new Date(row.sentAt).getTime() >= scheduledTime);
}

function hasMissedScheduleActivityForScheduledWindow(
  activityRows: WarmupActivityRecord[],
  scheduledAt: Date | null | undefined
): boolean {
  if (!scheduledAt) return false;
  const scheduledTime = new Date(scheduledAt).getTime();
  return activityRows.some((row) => row.status === "missed_schedule" && new Date(row.sentAt).getTime() >= scheduledTime);
}

function buildMissedScheduleErrorMessage(scheduledAt: Date): string {
  return `Scheduled send window passed without logged activity. scheduled_at=${scheduledAt.toISOString()}`;
}

export function getWarmupNextSendState(input: {
  sender: WarmupSenderRecord;
  latestActivity: WarmupActivityRecord | null;
  now?: Date;
}): WarmupNextSendState {
  const now = input.now ?? new Date();
  const sender = input.sender;
  const latestActivity = input.latestActivity;

  if (!isWarmupManagedStatus(sender.warmupStatus)) return "not_scheduled";
  if (sender.warmupStatus === "paused") return "paused";
  if (!sender.nextWarmupSendAt) return "rescheduling";

  const isRetryState =
    sender.lastWarmupResult === "error" ||
    sender.lastWarmupResult === "missed_schedule" ||
    latestActivity?.status === "failed" ||
    latestActivity?.status === "missed_schedule";

  if (new Date(sender.nextWarmupSendAt).getTime() <= now.getTime()) {
    return isRetryState ? "retry_pending" : "due_now";
  }

  return isRetryState ? "retry_pending" : "scheduled";
}

export function buildWarmupConfidence(input: {
  recentActivityRows: WarmupActivityRecord[];
  workerRow: WarmupWorkerRecord | null;
}): {
  level: WarmupConfidenceLevel;
  reason: string;
  recentSuccessCount: number;
  recentFailureCount: number;
  failureFreeRecentRuns: boolean;
} {
  const recentWindow = input.recentActivityRows.slice(0, WARMUP_CONFIDENCE_WINDOW);
  const recentSuccessCount = recentWindow.filter((row) => row.status === "sent").length;
  const recentFailureCount = recentWindow.filter((row) => row.status === "failed" || row.status === "missed_schedule").length;
  const recentFailureWindow = recentWindow.slice(0, WARMUP_CONFIDENCE_FAILURE_FREE_RUNS);
  const failureFreeRecentRuns = recentFailureWindow.length > 0 && recentFailureWindow.every((row) => row.status === "sent");
  const workerStatus = getWarmupWorkerStatus(input.workerRow?.lastHeartbeatAt);

  if (recentWindow.length === 0) {
    return {
      level: workerStatus === "healthy" ? "medium" : "low",
      reason: `No recent warmup activity yet • ${describeHeartbeatStatus(workerStatus)}`,
      recentSuccessCount,
      recentFailureCount,
      failureFreeRecentRuns,
    };
  }

  if (workerStatus === "healthy" && recentSuccessCount >= 8 && recentFailureCount === 0 && failureFreeRecentRuns) {
    return {
      level: "high",
      reason: `${recentSuccessCount}/${recentWindow.length} recent sends succeeded • no failures in last ${recentFailureWindow.length} runs • heartbeat fresh`,
      recentSuccessCount,
      recentFailureCount,
      failureFreeRecentRuns,
    };
  }

  if (workerStatus !== "stale" && recentSuccessCount >= Math.max(1, Math.ceil(recentWindow.length * 0.6)) && recentFailureCount <= 1) {
    return {
      level: "medium",
      reason: `${recentSuccessCount}/${recentWindow.length} recent sends succeeded • ${describeHeartbeatStatus(workerStatus)}`,
      recentSuccessCount,
      recentFailureCount,
      failureFreeRecentRuns,
    };
  }

  return {
    level: "low",
    reason: `${recentSuccessCount}/${recentWindow.length} recent sends succeeded • ${recentFailureCount} recent failures • ${describeHeartbeatStatus(workerStatus)}`,
    recentSuccessCount,
    recentFailureCount,
    failureFreeRecentRuns,
  };
}

export function buildWarmupSenderRepairPlan(input: {
  sender: WarmupSenderRecord;
  latestActivity: WarmupActivityRecord | null;
  activityRows: WarmupActivityRecord[];
  now?: Date;
  hasValidToken?: boolean;
}): WarmupSenderRepairPlan {
  const now = input.now ?? new Date();
  const sender = input.sender;
  const updates: Partial<typeof senderPool.$inferInsert> = {};

  if (!isWarmupManagedStatus(sender.warmupStatus)) {
    return { updates, shouldLogMissedSchedule: false, missedScheduleAt: null };
  }

  const warmupDay = Math.max(1, sender.warmupDay ?? 1);
  const dailyLimit = sender.dailyLimit && sender.dailyLimit > 0 ? sender.dailyLimit : getDailyLimit(warmupDay);
  const currentDayStartedAt = sender.currentDayStartedAt ?? sender.warmupStartedAt ?? now;

  if ((sender.warmupDay ?? 0) <= 0) {
    updates.warmupDay = warmupDay;
  }
  if ((sender.dailyLimit ?? 0) <= 0) {
    updates.dailyLimit = dailyLimit;
  }
  if (!sender.currentDayStartedAt) {
    updates.currentDayStartedAt = currentDayStartedAt;
  }

  const validActivityLoggedForWindow = hasValidActivityForScheduledWindow(input.activityRows, sender.nextWarmupSendAt);
  const missedScheduleAlreadyLogged = hasMissedScheduleActivityForScheduledWindow(input.activityRows, sender.nextWarmupSendAt);
  const scheduledTime = sender.nextWarmupSendAt ? new Date(sender.nextWarmupSendAt).getTime() : null;
  const retryWindowMissed =
    scheduledTime !== null &&
    now.getTime() > scheduledTime + WARMUP_MISSED_SCHEDULE_TOLERANCE_MS &&
    !validActivityLoggedForWindow;

  const nextWarmupSendAt = computeNextWarmupSendAt({
    warmupStatus: sender.warmupStatus,
    warmupDay,
    dailyLimit,
    warmupSentToday: sender.warmupSentToday,
    outreachSentToday: sender.outreachSentToday,
    currentDayStartedAt,
    warmupStartedAt: sender.warmupStartedAt,
    outreachEnabled: sender.outreachEnabled,
    cooldownUntil: sender.cooldownUntil,
    hasValidToken: input.hasValidToken,
    retryFromNow: retryWindowMissed,
    now,
  });

  if (!sender.nextWarmupSendAt || new Date(sender.nextWarmupSendAt).getTime() !== nextWarmupSendAt.getTime()) {
    updates.nextWarmupSendAt = nextWarmupSendAt;
  }

  if (retryWindowMissed) {
    updates.lastWarmupResult = "missed_schedule";
  }

  return {
    updates,
    shouldLogMissedSchedule:
      retryWindowMissed && !missedScheduleAlreadyLogged,
    missedScheduleAt: retryWindowMissed ? new Date(sender.nextWarmupSendAt ?? now) : null,
  };
}

export function buildWarmupSenderDashboardRow(input: {
  sender: WarmupSenderRecord;
  latestActivity: WarmupActivityRecord | null;
  activityRows: WarmupActivityRecord[];
  now?: Date;
}): WarmupSenderDashboardRow {
  const now = input.now ?? new Date();
  const sender = input.sender;
  const latestActivity = input.latestActivity;
  const warmupDay = Math.max(0, sender.warmupDay ?? 0);
  const dailyLimit = Math.max(0, sender.dailyLimit ?? 0);
  const warmupSentToday = Math.max(0, sender.warmupSentToday ?? 0);
  const outreachSentToday = Math.max(0, sender.outreachSentToday ?? 0);
  const sentToday = warmupSentToday + outreachSentToday;
  const remainingCapacity = Math.max(0, dailyLimit - sentToday);
  const isCoolingDown = !!sender.cooldownUntil && new Date(sender.cooldownUntil) > now;
  const isDelayed = hasMissedScheduledSend({
    nextWarmupSendAt: sender.nextWarmupSendAt,
    latestActivityAt: latestActivity?.sentAt ?? null,
    now,
  });
  const readyForOutreach = isReadyForOutreach(warmupDay, dailyLimit);
  const nextSendState = getWarmupNextSendState({
    sender,
    latestActivity,
    now,
  });

  let consecutiveFailures = 0;
  for (const activity of input.activityRows) {
    if (activity.status === "sent") break;
    consecutiveFailures += 1;
  }

  let dashboardStatus = sender.warmupStatus ?? "not_started";
  if (isDelayed || sender.lastWarmupResult === "missed_schedule" || sender.lastWarmupResult === "error" || consecutiveFailures > 0) {
    dashboardStatus = "error";
  } else if (readyForOutreach) {
    dashboardStatus = "ready";
  }

  return {
    id: sender.id,
    email: sender.senderEmail,
    sender_status: sender.status,
    warmup_status: sender.warmupStatus ?? "not_started",
    dashboard_status: dashboardStatus,
    warmup_day: warmupDay,
    daily_limit: dailyLimit,
    sent_today: sentToday,
    warmup_sent_today: warmupSentToday,
    outreach_sent_today: outreachSentToday,
    remaining_capacity: remainingCapacity,
    current_day_started_at: toIso(sender.currentDayStartedAt),
    next_warmup_send_at: toIso(sender.nextWarmupSendAt),
    next_send_state: nextSendState,
    last_warmup_sent_at: toIso(sender.lastWarmupSentAt),
    last_warmup_result: sender.lastWarmupResult ?? null,
    last_warmup_recipient: sender.lastWarmupRecipient ?? null,
    last_activity_at: toIso(latestActivity?.sentAt),
    last_activity_status: latestActivity?.status ?? null,
    last_activity_recipient: latestActivity?.recipientEmail ?? null,
    last_activity_type: latestActivity?.messageType ?? null,
    last_activity_error: latestActivity?.errorMessage ?? null,
    is_ready_for_outreach: readyForOutreach,
    outreach_enabled: sender.outreachEnabled ?? false,
    consecutive_failures: consecutiveFailures,
    is_delayed: isDelayed,
    health_score: sender.healthScore ?? null,
    cooldown_until: toIso(sender.cooldownUntil),
    is_cooling_down: isCoolingDown,
  };
}

export function buildWarmupSummaryRow(input: {
  senders: WarmupSenderDashboardRow[];
  workerRow: WarmupWorkerRecord | null;
  recentActivity: WarmupActivityRecord | null;
  recentActivityRows: WarmupActivityRecord[];
  pendingQueueCount: number;
}): WarmupSummaryRow {
  const activeSenders = input.senders.filter((sender) => isWarmupManagedStatus(sender.warmup_status));
  const nextSystemWarmupSendAt = activeSenders
    .map((sender) => sender.next_warmup_send_at)
    .filter((value): value is string => value !== null)
    .sort()[0] ?? null;
  const confidence = buildWarmupConfidence({
    recentActivityRows: input.recentActivityRows,
    workerRow: input.workerRow,
  });
  const workerConfig = getWarmupWorkerConfig(input.workerRow);

  return {
    total_senders: input.senders.length,
    warming_senders: input.senders.filter((sender) => sender.warmup_status === "warming").length,
    ready_senders: input.senders.filter((sender) => sender.is_ready_for_outreach).length,
    outreach_enabled_count: input.senders.filter((sender) => sender.outreach_enabled).length,
    pending_queue_count: input.pendingQueueCount,
    next_system_warmup_send_at: nextSystemWarmupSendAt,
    last_warmup_activity_at: toIso(input.recentActivity?.sentAt),
    last_warmup_activity: input.recentActivity
      ? {
          sender_email: input.recentActivity.senderEmail,
          recipient_email: input.recentActivity.recipientEmail,
          message_type: input.recentActivity.messageType,
          status: input.recentActivity.status,
          error_message: input.recentActivity.errorMessage,
          sent_at: toIso(input.recentActivity.sentAt),
        }
      : null,
    worker_last_heartbeat_at: toIso(input.workerRow?.lastHeartbeatAt),
    worker_last_run_started_at: toIso(input.workerRow?.lastRunStartedAt),
    worker_last_run_finished_at: toIso(input.workerRow?.lastRunFinishedAt),
    worker_last_run_status: input.workerRow?.lastRunStatus ?? null,
    worker_status: getWarmupWorkerStatus(input.workerRow?.lastHeartbeatAt),
    warmup_confidence: confidence.level,
    warmup_confidence_reason: confidence.reason,
    recent_success_count: confidence.recentSuccessCount,
    recent_failure_count: confidence.recentFailureCount,
    failure_free_recent_runs: confidence.failureFreeRecentRuns,
    stale_worker_alert_at: typeof workerConfig.lastStaleAlertAt === "string" ? workerConfig.lastStaleAlertAt : null,
  };
}

export function explainNoRecentWarmupActivity(input: {
  senders: WarmupSenderRecord[];
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const activeSenders = input.senders.filter((sender) => isWarmupManagedStatus(sender.warmupStatus));

  if (activeSenders.length === 0) {
    return "No warming senders are active.";
  }

  if (activeSenders.every((sender) => sender.cooldownUntil && new Date(sender.cooldownUntil) > now)) {
    return "All warming senders are in cooldown.";
  }

  const withinExecutionTolerance = activeSenders.every((sender) => {
    if (!sender.nextWarmupSendAt) return false;
    const scheduledAt = new Date(sender.nextWarmupSendAt).getTime();
    return now.getTime() <= scheduledAt + WARMUP_MISSED_SCHEDULE_TOLERANCE_MS;
  });

  if (withinExecutionTolerance) {
    return "All warming senders are scheduled or within execution tolerance.";
  }

  return "No recent warmup activity and at least one sender should have executed.";
}

export function validateWarmupSystemSnapshot(input: {
  senders: WarmupSenderRecord[];
  latestActivityBySender: Map<string, WarmupActivityRecord | null>;
  recentActivity: WarmupActivityRecord | null;
  workerRow: WarmupWorkerRecord | null;
  now?: Date;
}): WarmupValidationResult {
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  const warnings: string[] = [];
  const warmingSenders = input.senders.filter((sender) => sender.warmupStatus === "warming");
  const sendersWithFutureCountdowns = warmingSenders.filter(
    (sender) => !!sender.nextWarmupSendAt && new Date(sender.nextWarmupSendAt) > now
  ).length;
  const sendersWithUpcomingOrToleratedCountdowns = warmingSenders.filter((sender) => {
    if (!sender.nextWarmupSendAt) return false;
    return now.getTime() <= new Date(sender.nextWarmupSendAt).getTime() + WARMUP_MISSED_SCHEDULE_TOLERANCE_MS;
  }).length;

  for (const sender of warmingSenders) {
    if (!sender.currentDayStartedAt) {
      reasons.push(`${sender.senderEmail}: warming sender is missing current_day_started_at`);
    }
    if (!sender.dailyLimit || sender.dailyLimit <= 0) {
      reasons.push(`${sender.senderEmail}: warming sender is missing daily_limit`);
    }
    if (!sender.nextWarmupSendAt) {
      reasons.push(`${sender.senderEmail}: warming sender is missing next_warmup_send_at`);
    }
    if (sender.lastWarmupResult === "missed_schedule") {
      reasons.push(`${sender.senderEmail}: sender is flagged missed_schedule`);
    }
    if (
      sender.nextWarmupSendAt &&
      hasMissedScheduledSend({
        nextWarmupSendAt: sender.nextWarmupSendAt,
        latestActivityAt: input.latestActivityBySender.get(sender.senderEmail)?.sentAt ?? null,
        now,
      })
    ) {
      reasons.push(`${sender.senderEmail}: scheduled send window passed without logged activity`);
    }
  }

  if (warmingSenders.length > 0 && sendersWithUpcomingOrToleratedCountdowns === 0) {
    reasons.push("No warming sender has a future next_warmup_send_at.");
  }

  const workerStatus = getWarmupWorkerStatus(input.workerRow?.lastHeartbeatAt);
  if (!input.workerRow) {
    reasons.push("Worker health row is missing.");
  } else {
    if (!input.workerRow.lastHeartbeatAt) reasons.push("Worker heartbeat is missing.");
    if (!input.workerRow.lastRunStartedAt) reasons.push("Worker last_run_started_at is missing.");
    if (!input.workerRow.lastRunFinishedAt) reasons.push("Worker last_run_finished_at is missing.");
    if (!input.workerRow.lastRunStatus) reasons.push("Worker last_run_status is missing.");
    if (workerStatus !== "healthy") {
      reasons.push(`Worker heartbeat is not recent enough (${workerStatus}).`);
    }
  }

  const recentActivityExists =
    !!input.recentActivity &&
    !!input.recentActivity.sentAt &&
    now.getTime() - new Date(input.recentActivity.sentAt).getTime() <= WARMUP_ACTIVITY_RECENT_MS;
  const explanation = recentActivityExists ? null : explainNoRecentWarmupActivity({ senders: input.senders, now });
  if (!recentActivityExists && explanation === "No recent warmup activity and at least one sender should have executed.") {
    reasons.push(explanation);
  } else if (!recentActivityExists && explanation) {
    warnings.push(explanation);
  }

  return {
    pass: reasons.length === 0,
    reasons,
    warnings,
    explanation,
    summary: {
      warming_senders: warmingSenders.length,
      senders_with_countdowns: warmingSenders.filter((sender) => !!sender.nextWarmupSendAt).length,
      senders_with_future_countdowns: sendersWithFutureCountdowns,
      overdue_senders: warmingSenders.filter((sender) =>
        hasMissedScheduledSend({
          nextWarmupSendAt: sender.nextWarmupSendAt,
          latestActivityAt: input.latestActivityBySender.get(sender.senderEmail)?.sentAt ?? null,
          now,
        })
      ).length,
      recent_activity_found: recentActivityExists,
      worker_status: workerStatus,
    },
  };
}

export async function ensureWarmupWorkerHealthRow(): Promise<void> {
  const { db } = await import("../../../db/drizzle");
  await db.insert(lgsWorkerHealth).values({
    workerName: WARMUP_WORKER_NAME,
  }).onConflictDoNothing({
    target: lgsWorkerHealth.workerName,
  });
}

export async function recordWarmupActivity(entry: {
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  messageType: string;
  status: string;
  provider?: string;
  providerMessageId?: string | null;
  latencyMs?: number | null;
  errorMessage?: string;
  sentAt?: Date;
}): Promise<void> {
  try {
    const { db } = await import("../../../db/drizzle");
    await db.insert(lgsWarmupActivity).values({
      senderEmail: entry.senderEmail,
      recipientEmail: entry.recipientEmail,
      subject: entry.subject,
      messageType: entry.messageType,
      provider: entry.provider ?? null,
      providerMessageId: entry.providerMessageId ?? null,
      latencyMs: entry.latencyMs ?? null,
      status: entry.status,
      errorMessage: entry.errorMessage ?? null,
      sentAt: entry.sentAt ?? new Date(),
    });
  } catch (err) {
    console.error("[LGS Warmup] activity log error:", err);
  }
}

export async function recordMissedScheduleActivityIfNeeded(entry: {
  senderEmail: string;
  recipientEmail: string;
  scheduledAt: Date;
  sentAt?: Date;
}): Promise<boolean> {
  try {
    const { db } = await import("../../../db/drizzle");
    const existing = await db
      .select({ id: lgsWarmupActivity.id })
      .from(lgsWarmupActivity)
      .where(
        and(
          eq(lgsWarmupActivity.senderEmail, entry.senderEmail),
          eq(lgsWarmupActivity.status, "missed_schedule"),
          gte(lgsWarmupActivity.sentAt, entry.scheduledAt)
        )
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (existing) return false;

    await recordWarmupActivity({
      senderEmail: entry.senderEmail,
      recipientEmail: entry.recipientEmail,
      subject: `Warmup schedule missed @ ${entry.scheduledAt.toISOString()}`,
      messageType: "system",
      status: "missed_schedule",
      errorMessage: buildMissedScheduleErrorMessage(entry.scheduledAt),
      sentAt: entry.sentAt,
    });
    return true;
  } catch (err) {
    console.error("[LGS Warmup] missed schedule log error:", err);
    return false;
  }
}

export async function maybeAlertOnStaleWarmupWorker(input?: {
  workerRow?: WarmupWorkerRecord | null;
  now?: Date;
}): Promise<boolean> {
  const { db } = await import("../../../db/drizzle");
  const now = input?.now ?? new Date();
  await ensureWarmupWorkerHealthRow();

  const workerRow = input?.workerRow ?? await db
    .select()
    .from(lgsWorkerHealth)
    .where(eq(lgsWorkerHealth.workerName, WARMUP_WORKER_NAME))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const lastHeartbeatAt = workerRow?.lastHeartbeatAt ?? null;
  const heartbeatAgeMs = lastHeartbeatAt ? now.getTime() - new Date(lastHeartbeatAt).getTime() : Infinity;
  if (heartbeatAgeMs < WARMUP_STALE_ALERT_THRESHOLD_MS) {
    return false;
  }

  const workerConfig = getWarmupWorkerConfig(workerRow);
  const lastAlertAt = typeof workerConfig.lastStaleAlertAt === "string" ? new Date(workerConfig.lastStaleAlertAt) : null;
  if (lastAlertAt && now.getTime() - lastAlertAt.getTime() < WARMUP_STALE_ALERT_THRESHOLD_MS) {
    return false;
  }

  const reason = lastHeartbeatAt
    ? `Warmup worker heartbeat stale (${Math.round(heartbeatAgeMs / 60_000)}m since last heartbeat).`
    : "Warmup worker heartbeat missing.";

  console.error("[LGS Warmup] stale worker alert:", reason);

  const webhookUrl = process.env.LGS_WARMUP_ALERT_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: reason,
          worker: WARMUP_WORKER_NAME,
          lastHeartbeatAt: toIso(lastHeartbeatAt),
          alertAt: now.toISOString(),
        }),
      });
    } catch (err) {
      console.error("[LGS Warmup] stale worker webhook alert failed:", err);
    }
  }

  const alertEmailTo = process.env.LGS_WARMUP_ALERT_EMAIL_TO?.trim();
  if (alertEmailTo) {
    try {
      await sendTransactionalEmail({
        to: alertEmailTo,
        subject: "LGS Warmup Worker Alert",
        text: reason,
        html: `<p>${reason}</p><p>Worker: ${WARMUP_WORKER_NAME}</p><p>Last heartbeat: ${toIso(lastHeartbeatAt) ?? "missing"}</p>`,
      });
    } catch (err) {
      console.error("[LGS Warmup] stale worker email alert failed:", err);
    }
  }

  await db
    .update(lgsWorkerHealth)
    .set({
      configCheckResult: {
        ...workerConfig,
        lastStaleAlertAt: now.toISOString(),
        lastStaleAlertReason: reason,
      },
    })
    .where(eq(lgsWorkerHealth.workerName, WARMUP_WORKER_NAME));

  return true;
}

function buildActivityMaps(rows: WarmupActivityRecord[]): {
  latestActivityBySender: Map<string, WarmupActivityRecord | null>;
  activityRowsBySender: Map<string, WarmupActivityRecord[]>;
} {
  const latestActivityBySender = new Map<string, WarmupActivityRecord | null>();
  const activityRowsBySender = new Map<string, WarmupActivityRecord[]>();

  for (const row of rows) {
    if (!latestActivityBySender.has(row.senderEmail)) {
      latestActivityBySender.set(row.senderEmail, row);
    }
    const existing = activityRowsBySender.get(row.senderEmail) ?? [];
    existing.push(row);
    activityRowsBySender.set(row.senderEmail, existing);
  }

  return { latestActivityBySender, activityRowsBySender };
}

export async function enforceWarmupSystemState(now: Date = new Date()): Promise<void> {
  return enforceWarmupSystemStateWithOptions({ now });
}

export async function enforceWarmupSystemStateWithOptions(input?: {
  now?: Date;
  logMissedSchedules?: boolean;
}): Promise<void> {
  const { db } = await import("../../../db/drizzle");
  const now = input?.now ?? new Date();
  const logMissedSchedules = input?.logMissedSchedules ?? false;
  await ensureWarmupWorkerHealthRow();

  const managedSenders = await db
    .select()
    .from(senderPool)
    .where(
      or(
        eq(senderPool.warmupStatus, "warming"),
        eq(senderPool.warmupStatus, "ready")
      )
    );

  if (managedSenders.length === 0) return;

  const senderEmails = managedSenders.map((sender) => sender.senderEmail);
  const activityRows = await db
    .select()
    .from(lgsWarmupActivity)
    .where(inArray(lgsWarmupActivity.senderEmail, senderEmails))
    .orderBy(desc(lgsWarmupActivity.sentAt));

  const { latestActivityBySender, activityRowsBySender } = buildActivityMaps(activityRows);

  for (const sender of managedSenders) {
    const latestActivity = latestActivityBySender.get(sender.senderEmail) ?? null;
    const senderActivityRows = activityRowsBySender.get(sender.senderEmail) ?? [];
    const hasValidToken = await hasGmailTokenForSender(sender.senderEmail);
    const plan = buildWarmupSenderRepairPlan({
      sender,
      latestActivity,
      activityRows: senderActivityRows,
      now,
      hasValidToken,
    });

    if (Object.keys(plan.updates).length > 0) {
      await db
        .update(senderPool)
        .set({ ...plan.updates, updatedAt: now })
        .where(eq(senderPool.id, sender.id));
    }

    if (logMissedSchedules && plan.shouldLogMissedSchedule && plan.missedScheduleAt) {
      await recordMissedScheduleActivityIfNeeded({
        senderEmail: sender.senderEmail,
        recipientEmail: sender.lastWarmupRecipient ?? sender.senderEmail,
        scheduledAt: plan.missedScheduleAt,
        sentAt: now,
      });
    }
  }
}

export async function validateWarmupSystem(): Promise<WarmupValidationResult> {
  const { db } = await import("../../../db/drizzle");
  await enforceWarmupSystemState();

  const [senders, workerRow, recentActivity] = await Promise.all([
    db.select().from(senderPool),
    db
      .select()
      .from(lgsWorkerHealth)
      .where(eq(lgsWorkerHealth.workerName, WARMUP_WORKER_NAME))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(lgsWarmupActivity)
      .orderBy(desc(lgsWarmupActivity.sentAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const senderEmails = senders.map((sender) => sender.senderEmail);
  const activityRows = senderEmails.length === 0
    ? []
    : await db
        .select()
        .from(lgsWarmupActivity)
        .where(inArray(lgsWarmupActivity.senderEmail, senderEmails))
        .orderBy(desc(lgsWarmupActivity.sentAt));

  const { latestActivityBySender } = buildActivityMaps(activityRows);
  await maybeAlertOnStaleWarmupWorker({ workerRow });

  return validateWarmupSystemSnapshot({
    senders,
    latestActivityBySender,
    recentActivity,
    workerRow,
  });
}

export async function getWarmupDashboardData(input: {
  pendingQueueCount: number;
}): Promise<{
  data: WarmupSenderDashboardRow[];
  summary: WarmupSummaryRow;
}> {
  const { db } = await import("../../../db/drizzle");
  await enforceWarmupSystemState();

  const [rows, workerRow, recentActivity] = await Promise.all([
    db.select().from(senderPool).orderBy(senderPool.senderEmail),
    db
      .select()
      .from(lgsWorkerHealth)
      .where(eq(lgsWorkerHealth.workerName, WARMUP_WORKER_NAME))
      .limit(1)
      .then((result) => result[0] ?? null),
    db
      .select()
      .from(lgsWarmupActivity)
      .orderBy(desc(lgsWarmupActivity.sentAt))
      .limit(1)
      .then((result) => result[0] ?? null),
  ]);
  const recentActivityRows = await db
    .select()
    .from(lgsWarmupActivity)
    .orderBy(desc(lgsWarmupActivity.sentAt))
    .limit(WARMUP_CONFIDENCE_WINDOW);

  const senderEmails = rows.map((sender) => sender.senderEmail);
  const activityRows = senderEmails.length === 0
    ? []
    : await db
        .select()
        .from(lgsWarmupActivity)
        .where(inArray(lgsWarmupActivity.senderEmail, senderEmails))
        .orderBy(desc(lgsWarmupActivity.sentAt));

  const { latestActivityBySender, activityRowsBySender } = buildActivityMaps(activityRows);

  const data = rows.map((sender) =>
    buildWarmupSenderDashboardRow({
      sender,
      latestActivity: latestActivityBySender.get(sender.senderEmail) ?? null,
      activityRows: activityRowsBySender.get(sender.senderEmail) ?? [],
    })
  );

  const summary = buildWarmupSummaryRow({
    senders: data,
    workerRow,
    recentActivity,
    recentActivityRows,
    pendingQueueCount: input.pendingQueueCount,
  });

  return { data, summary };
}
