import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  lgsWarmupActivity,
  lgsWorkerHealth,
  senderPool,
  warmupSystemState,
} from "../../../db/schema/directoryEngine";
import { sendTransactionalEmail } from "../../mailer/sendTransactionalEmail";
import { getDailyLimit, isReadyForOutreach } from "./warmupSchedule";

export const WARMUP_WORKER_NAME = "warmup";
export const WARMUP_SYSTEM_STATE_NAME = "default";
export const WARMUP_DEFAULT_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const WARMUP_INTERVAL_JITTER_MS = 20 * 60 * 1000;
export const WARMUP_WORKER_INTERVAL_MS = 60 * 1000;
export const WARMUP_RETRY_DELAY_MS = 15 * 60 * 1000;
export const WARMUP_MAX_RETRIES = 3;
export const WARMUP_EMERGENCY_TRIGGER_MS = 2 * 60 * 1000;
export const WARMUP_HEARTBEAT_STALE_MS = 5 * 60 * 1000;
export const WARMUP_ACTIVITY_RECENT_MS = 5 * 60 * 60 * 1000;
export const WARMUP_STALE_ALERT_THRESHOLD_MS = 10 * 60 * 1000;
export const WARMUP_SEND_LOCK_STALE_MS = 15 * 60 * 1000;
export const WARMUP_CONFIDENCE_WINDOW = 10;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type WarmupWorkerStatus = "healthy" | "stale";
export type WarmupConfidenceLevel = "high" | "medium" | "low";
export type WarmupNextSendState =
  | "scheduled"
  | "retry_pending"
  | "due_now"
  | "rescheduling"
  | "paused"
  | "not_scheduled";
export type WarmupStatusReason =
  | "sent"
  | "skipped_rate_limit"
  | "skipped_interval_not_met"
  | "failed_provider_error"
  | "failed_worker_error"
  | "recovered_missed_send";

export type WarmupSenderRecord = typeof senderPool.$inferSelect;
export type WarmupActivityRecord = typeof lgsWarmupActivity.$inferSelect;
export type WarmupWorkerRecord = typeof lgsWorkerHealth.$inferSelect;
export type WarmupSystemStateRecord = typeof warmupSystemState.$inferSelect;

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

export type WarmupScheduleState = {
  cycleIndex: number;
  intervalSeconds: number;
  intervalAnchorAt: Date;
  regularDueAt: Date;
  retryDueAt: Date | null;
  rateLimitBackoffAt: Date | null;
  nextActionAt: Date;
  currentDayEndsAt: Date | null;
  senderRateLimited: boolean;
  warmupBudget: number;
  totalSentToday: number;
  remainingCapacity: number;
  consecutiveFailures: number;
  cooldownActive: boolean;
  isRecoveredMissedSend: boolean;
};

export type WarmupSendEvaluation = WarmupScheduleState & {
  shouldSend: boolean;
  reason: string;
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

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function getWarmupBaselineAt(sender: WarmupSenderRecord, now: Date): Date {
  return (
    sender.warmupIntervalAnchorAt ??
    sender.lastWarmupSentAt ??
    sender.warmupStartedAt ??
    sender.currentDayStartedAt ??
    sender.createdAt ??
    now
  );
}

function getConsecutiveWarmupFailures(activityRows: WarmupActivityRecord[]): {
  consecutiveFailures: number;
  latestFailureAt: Date | null;
} {
  let consecutiveFailures = 0;
  let latestFailureAt: Date | null = null;

  for (const row of activityRows) {
    if (row.status === "sent") break;
    if (row.status === "failed") {
      consecutiveFailures += 1;
      latestFailureAt = latestFailureAt ?? row.sentAt;
    }
  }

  return { consecutiveFailures, latestFailureAt };
}

export function getWarmupWorkerStatus(lastHeartbeatAt: Date | null | undefined): WarmupWorkerStatus {
  if (!lastHeartbeatAt) return "stale";
  return Date.now() - new Date(lastHeartbeatAt).getTime() <= WARMUP_HEARTBEAT_STALE_MS
    ? "healthy"
    : "stale";
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

export function computeWarmupIntervalSeconds(input: {
  senderId: string;
  cycleIndex: number;
}): number {
  const seed = hashString(`${input.senderId}:${input.cycleIndex}`);
  const normalized = (seed % 10_000) / 10_000;
  const jitterMs = Math.round(((normalized * 2) - 1) * WARMUP_INTERVAL_JITTER_MS);
  return Math.round((WARMUP_DEFAULT_INTERVAL_MS + jitterMs) / 1000);
}

export function computeWarmupRateLimitBackoffAt(input: {
  senderId: string;
  now?: Date;
  minMinutes?: number;
  maxMinutes?: number;
}): Date {
  const now = input.now ?? new Date();
  const minMinutes = input.minMinutes ?? 10;
  const maxMinutes = input.maxMinutes ?? 30;
  const spreadMinutes = Math.max(0, maxMinutes - minMinutes);
  const offsetMinutes = spreadMinutes === 0
    ? minMinutes
    : minMinutes + (hashString(`${input.senderId}:${now.toISOString().slice(0, 13)}`) % (spreadMinutes + 1));
  return new Date(now.getTime() + (offsetMinutes * 60 * 1000));
}

export function computeWarmupScheduleState(input: {
  sender: WarmupSenderRecord;
  activityRows?: WarmupActivityRecord[];
  now?: Date;
}): WarmupScheduleState {
  const now = input.now ?? new Date();
  const sender = input.sender;
  const activityRows = input.activityRows ?? [];
  const cycleIndex = Math.max(0, sender.warmupTotalSent ?? 0);
  const intervalAnchorAt = getWarmupBaselineAt(sender, now);
  const intervalSeconds = computeWarmupIntervalSeconds({
    senderId: sender.id,
    cycleIndex,
  });
  const regularDueAt = new Date(intervalAnchorAt.getTime() + (intervalSeconds * 1000));
  const { consecutiveFailures, latestFailureAt } = getConsecutiveWarmupFailures(activityRows);
  const retryDueAt =
    latestFailureAt && consecutiveFailures > 0 && consecutiveFailures < WARMUP_MAX_RETRIES
      ? computeWarmupRetryAt(latestFailureAt)
      : null;
  const rateLimitBackoffAt =
    sender.lastWarmupResult === "skipped" && sender.nextWarmupSendAt
      ? new Date(sender.nextWarmupSendAt)
      : null;

  const totalSentToday = Math.max(0, (sender.warmupSentToday ?? 0) + (sender.outreachSentToday ?? 0));
  const remainingCapacity = Math.max(0, (sender.dailyLimit ?? 0) - totalSentToday);
  const warmupBudget = getWarmupBudget({
    warmupStatus: sender.warmupStatus,
    dailyLimit: sender.dailyLimit,
    warmupSentToday: sender.warmupSentToday,
    outreachSentToday: sender.outreachSentToday,
    outreachEnabled: sender.outreachEnabled,
  });
  const senderRateLimited =
    remainingCapacity <= 0 || Math.max(0, sender.warmupSentToday ?? 0) >= warmupBudget;
  const currentDayEndsAt = sender.currentDayStartedAt
    ? new Date(new Date(sender.currentDayStartedAt).getTime() + DAY_MS)
    : null;
  const cooldownActive = !!sender.cooldownUntil && new Date(sender.cooldownUntil) > now;
  const isRecoveredMissedSend = now.getTime() - regularDueAt.getTime() > WARMUP_WORKER_INTERVAL_MS;

  let nextActionAt = retryDueAt ?? rateLimitBackoffAt ?? regularDueAt;

  if (cooldownActive && sender.cooldownUntil && sender.cooldownUntil > nextActionAt) {
    nextActionAt = new Date(sender.cooldownUntil);
  }

  if (senderRateLimited && currentDayEndsAt && currentDayEndsAt > nextActionAt) {
    nextActionAt = currentDayEndsAt;
  }

  return {
    cycleIndex,
    intervalSeconds,
    intervalAnchorAt,
    regularDueAt,
    retryDueAt,
    rateLimitBackoffAt,
    nextActionAt,
    currentDayEndsAt,
    senderRateLimited,
    warmupBudget,
    totalSentToday,
    remainingCapacity,
    consecutiveFailures,
    cooldownActive,
    isRecoveredMissedSend,
  };
}

export function evaluateWarmupSend(input: {
  sender: WarmupSenderRecord;
  activityRows?: WarmupActivityRecord[];
  now?: Date;
}): WarmupSendEvaluation {
  const now = input.now ?? new Date();
  const sender = input.sender;
  const schedule = computeWarmupScheduleState({
    sender,
    activityRows: input.activityRows,
    now,
  });

  if (!isWarmupManagedStatus(sender.warmupStatus)) {
    return { ...schedule, shouldSend: false, reason: "not_scheduled" };
  }

  if (sender.warmupStatus === "paused") {
    return { ...schedule, shouldSend: false, reason: "paused" };
  }

  if (!sender.gmailConnected) {
    return { ...schedule, shouldSend: false, reason: "sender_disconnected" };
  }

  if (
    sender.warmupSendingAt &&
    now.getTime() - new Date(sender.warmupSendingAt).getTime() < WARMUP_SEND_LOCK_STALE_MS
  ) {
    return { ...schedule, shouldSend: false, reason: "currently_sending" };
  }

  if (schedule.cooldownActive) {
    return { ...schedule, shouldSend: false, reason: "cooldown_active" };
  }

  if (schedule.rateLimitBackoffAt && now.getTime() < schedule.rateLimitBackoffAt.getTime()) {
    return { ...schedule, shouldSend: false, reason: "rate_limit_backoff" };
  }

  if (schedule.senderRateLimited) {
    return { ...schedule, shouldSend: false, reason: "daily_rate_limit" };
  }

  if (schedule.retryDueAt && now.getTime() >= schedule.retryDueAt.getTime()) {
    return { ...schedule, shouldSend: true, reason: "retry_due" };
  }

  if (now.getTime() >= schedule.regularDueAt.getTime()) {
    return {
      ...schedule,
      shouldSend: true,
      reason: schedule.isRecoveredMissedSend ? "recovered_missed_send" : "interval_elapsed",
    };
  }

  return { ...schedule, shouldSend: false, reason: "interval_not_met" };
}

export function computeNextWarmupSendAt(input: {
  senderId?: string;
  warmupStatus: string | null | undefined;
  warmupDay: number | null | undefined;
  dailyLimit: number | null | undefined;
  warmupTotalSent?: number | null | undefined;
  warmupSentToday: number | null | undefined;
  outreachSentToday: number | null | undefined;
  currentDayStartedAt: Date | null | undefined;
  warmupStartedAt?: Date | null | undefined;
  lastWarmupSentAt?: Date | null | undefined;
  outreachEnabled: boolean | null | undefined;
  cooldownUntil?: Date | null | undefined;
  hasValidToken?: boolean;
  retryFromNow?: boolean;
  now?: Date;
}): Date {
  const now = input.now ?? new Date();
  if (!isWarmupManagedStatus(input.warmupStatus)) return now;
  if (input.retryFromNow || input.hasValidToken === false) {
    return computeWarmupRetryAt(now);
  }

  const baselineAt =
    input.lastWarmupSentAt ??
    input.currentDayStartedAt ??
    input.warmupStartedAt ??
    now;
  const cycleIndex = Math.max(0, Number(input.warmupTotalSent ?? 0));
  const intervalSeconds = computeWarmupIntervalSeconds({
    senderId: input.senderId ?? "warmup-default",
    cycleIndex,
  });
  const regularDueAt = new Date(baselineAt.getTime() + (intervalSeconds * 1000));
  const warmupBudget = getWarmupBudget({
    warmupStatus: input.warmupStatus,
    dailyLimit: input.dailyLimit,
    warmupSentToday: input.warmupSentToday,
    outreachSentToday: input.outreachSentToday,
    outreachEnabled: input.outreachEnabled,
  });
  const senderRateLimited =
    Math.max(0, Number(input.warmupSentToday ?? 0)) >= warmupBudget ||
    Math.max(0, Number(input.dailyLimit ?? 0) - (Number(input.warmupSentToday ?? 0) + Number(input.outreachSentToday ?? 0))) <= 0;

  if (senderRateLimited && input.currentDayStartedAt) {
    return new Date(new Date(input.currentDayStartedAt).getTime() + DAY_MS);
  }

  if (input.cooldownUntil && new Date(input.cooldownUntil) > regularDueAt) {
    return new Date(input.cooldownUntil);
  }

  return regularDueAt;
}

export function hasMissedScheduledSend(input: {
  nextWarmupSendAt: Date | null | undefined;
  latestActivityAt: Date | null | undefined;
  now?: Date;
  toleranceMs?: number;
}): boolean {
  if (!input.nextWarmupSendAt) return false;

  const now = input.now ?? new Date();
  const toleranceMs = input.toleranceMs ?? WARMUP_WORKER_INTERVAL_MS;
  if (now.getTime() <= new Date(input.nextWarmupSendAt).getTime() + toleranceMs) return false;

  return !input.latestActivityAt || new Date(input.latestActivityAt) < new Date(input.nextWarmupSendAt);
}

export function getWarmupNextSendState(input: {
  sender: WarmupSenderRecord;
  latestActivity: WarmupActivityRecord | null;
  activityRows?: WarmupActivityRecord[];
  now?: Date;
}): WarmupNextSendState {
  const now = input.now ?? new Date();
  const sender = input.sender;
  const schedule = computeWarmupScheduleState({
    sender,
    activityRows: input.activityRows ?? (input.latestActivity ? [input.latestActivity] : []),
    now,
  });

  if (!isWarmupManagedStatus(sender.warmupStatus)) return "not_scheduled";
  if (sender.warmupStatus === "paused") return "paused";
  if (!sender.nextWarmupSendAt) return "rescheduling";
  if (schedule.retryDueAt && schedule.retryDueAt <= schedule.regularDueAt && schedule.retryDueAt > now) {
    return "retry_pending";
  }
  if (schedule.nextActionAt <= now) return "due_now";
  return "scheduled";
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
  const recentFailureCount = recentWindow.filter((row) => row.status === "failed").length;
  const failureFreeRecentRuns =
    recentWindow.length > 0 && recentWindow.slice(0, 5).every((row) => row.status === "sent");
  const workerStatus = getWarmupWorkerStatus(input.workerRow?.lastHeartbeatAt);

  if (recentWindow.length === 0) {
    return {
      level: workerStatus === "healthy" ? "medium" : "low",
      reason: workerStatus === "healthy" ? "No recent warmup activity yet, but worker heartbeat is healthy." : "Worker heartbeat is stale and no recent warmup activity was found.",
      recentSuccessCount,
      recentFailureCount,
      failureFreeRecentRuns,
    };
  }

  if (workerStatus === "healthy" && recentFailureCount === 0 && recentSuccessCount >= 8) {
    return {
      level: "high",
      reason: `${recentSuccessCount}/${recentWindow.length} recent sends succeeded and worker heartbeat is healthy.`,
      recentSuccessCount,
      recentFailureCount,
      failureFreeRecentRuns,
    };
  }

  if (workerStatus === "healthy" && recentSuccessCount >= Math.max(1, Math.ceil(recentWindow.length * 0.6))) {
    return {
      level: "medium",
      reason: `${recentSuccessCount}/${recentWindow.length} recent sends succeeded with a healthy worker heartbeat.`,
      recentSuccessCount,
      recentFailureCount,
      failureFreeRecentRuns,
    };
  }

  return {
    level: "low",
    reason: `${recentFailureCount} recent warmup failures detected or worker heartbeat is stale.`,
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
  const warmupDay = Math.max(1, sender.warmupDay ?? 1);
  const dailyLimit = sender.dailyLimit && sender.dailyLimit > 0 ? sender.dailyLimit : getDailyLimit(warmupDay);
  const currentDayStartedAt = sender.currentDayStartedAt ?? sender.warmupStartedAt ?? now;
  const nextWarmupSendAt = computeWarmupScheduleState({
    sender: {
      ...sender,
      warmupDay,
      dailyLimit,
      currentDayStartedAt,
      warmupIntervalAnchorAt: sender.warmupIntervalAnchorAt ?? sender.lastWarmupSentAt ?? sender.warmupStartedAt ?? currentDayStartedAt,
      lastWarmupResult: sender.lastWarmupResult === "missed_schedule" ? "error" : sender.lastWarmupResult,
    },
    activityRows: input.activityRows,
    now,
  }).nextActionAt;

  if ((sender.warmupDay ?? 0) <= 0) updates.warmupDay = warmupDay;
  if ((sender.dailyLimit ?? 0) <= 0) updates.dailyLimit = dailyLimit;
  if (!sender.currentDayStartedAt) updates.currentDayStartedAt = currentDayStartedAt;
  if (!sender.warmupIntervalAnchorAt) {
    updates.warmupIntervalAnchorAt = sender.lastWarmupSentAt ?? sender.warmupStartedAt ?? currentDayStartedAt;
  }
  if (!sender.nextWarmupSendAt || sender.nextWarmupSendAt.getTime() !== nextWarmupSendAt.getTime()) {
    updates.nextWarmupSendAt = nextWarmupSendAt;
  }
  if (sender.lastWarmupResult === "missed_schedule") {
    updates.lastWarmupResult = "error";
  }
  if (sender.warmupSendingAt && now.getTime() - new Date(sender.warmupSendingAt).getTime() >= WARMUP_SEND_LOCK_STALE_MS) {
    updates.warmupSendingAt = null as unknown as undefined;
  }

  return {
    updates,
    shouldLogMissedSchedule: false,
    missedScheduleAt: null,
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
  const schedule = computeWarmupScheduleState({
    sender,
    activityRows: input.activityRows,
    now,
  });
  const readyForOutreach = isReadyForOutreach(warmupDay, dailyLimit);
  const isCoolingDown = !!sender.cooldownUntil && new Date(sender.cooldownUntil) > now;
  const isDelayed =
    now.getTime() - schedule.regularDueAt.getTime() > WARMUP_WORKER_INTERVAL_MS &&
    !schedule.senderRateLimited &&
    !schedule.cooldownActive;
  const nextSendState = getWarmupNextSendState({
    sender: {
      ...sender,
      nextWarmupSendAt: schedule.nextActionAt,
    },
    latestActivity,
    activityRows: input.activityRows,
    now,
  });

  let dashboardStatus = sender.warmupStatus ?? "not_started";
  if (schedule.consecutiveFailures > 0 || isDelayed) {
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
    sent_today: schedule.totalSentToday,
    warmup_sent_today: warmupSentToday,
    outreach_sent_today: outreachSentToday,
    remaining_capacity: schedule.remainingCapacity,
    current_day_started_at: toIso(sender.currentDayStartedAt),
    next_warmup_send_at: toIso(schedule.nextActionAt),
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
    consecutive_failures: schedule.consecutiveFailures,
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
  const nextSystemWarmupSendAt =
    activeSenders
      .map((sender) => sender.next_warmup_send_at)
      .filter((value): value is string => Boolean(value))
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

  const hasOverdueSender = activeSenders.some((sender) => {
    const schedule = computeWarmupScheduleState({ sender, now });
    return schedule.regularDueAt <= now && !schedule.senderRateLimited && !schedule.cooldownActive;
  });

  if (hasOverdueSender) {
    return "No recent warmup activity and at least one sender is overdue.";
  }

  return "All warming senders are waiting for their interval, retry, or daily reset.";
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
  const warmingSenders = input.senders.filter((sender) => sender.warmupStatus === "warming" || sender.warmupStatus === "ready");
  let overdueSenders = 0;
  let sendersWithFutureCountdowns = 0;

  for (const sender of warmingSenders) {
    const schedule = computeWarmupScheduleState({ sender, now });
    const latestActivity = input.latestActivityBySender.get(sender.senderEmail) ?? null;

    if (!sender.currentDayStartedAt) {
      reasons.push(`${sender.senderEmail}: warming sender is missing current_day_started_at`);
    }

    if (!sender.nextWarmupSendAt) {
      reasons.push(`${sender.senderEmail}: warming sender is missing next_warmup_send_at`);
    } else if (sender.nextWarmupSendAt > now) {
      sendersWithFutureCountdowns += 1;
    }

    const overdueMs = now.getTime() - schedule.regularDueAt.getTime();
    const shouldBeSending = overdueMs > 0 && !schedule.senderRateLimited && !schedule.cooldownActive;
    if (shouldBeSending) overdueSenders += 1;

    if (overdueMs > 60 * 60 * 1000 && !schedule.senderRateLimited && !schedule.cooldownActive) {
      reasons.push(`${sender.senderEmail}: warmup send overdue by more than 60 minutes`);
    }

    if (sender.lastWarmupResult === "missed_schedule") {
      warnings.push(`${sender.senderEmail}: legacy missed_schedule marker found`);
    }

    if (
      latestActivity &&
      latestActivity.status === "failed" &&
      schedule.consecutiveFailures >= WARMUP_MAX_RETRIES &&
      schedule.regularDueAt > now
    ) {
      warnings.push(`${sender.senderEmail}: retries exhausted; waiting for next interval send`);
    }
  }

  const workerStatus = getWarmupWorkerStatus(input.workerRow?.lastHeartbeatAt);
  if (!input.workerRow) {
    reasons.push("Worker health row is missing.");
  } else if (workerStatus !== "healthy") {
    reasons.push("Worker heartbeat is stale.");
  }

  const recentActivityExists =
    !!input.recentActivity &&
    !!input.recentActivity.sentAt &&
    now.getTime() - new Date(input.recentActivity.sentAt).getTime() <= WARMUP_ACTIVITY_RECENT_MS;
  const explanation = recentActivityExists ? null : explainNoRecentWarmupActivity({ senders: input.senders, now });
  if (!recentActivityExists && explanation?.includes("overdue")) {
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
      overdue_senders: overdueSenders,
      recent_activity_found: recentActivityExists,
      worker_status: workerStatus,
    },
  };
}

export async function ensureWarmupWorkerHealthRow(): Promise<void> {
  const { db } = await import("../../../db/drizzle");
  await db
    .insert(lgsWorkerHealth)
    .values({ workerName: WARMUP_WORKER_NAME })
    .onConflictDoNothing({ target: lgsWorkerHealth.workerName });
}

export async function ensureWarmupSystemStateRow(): Promise<void> {
  const { db } = await import("../../../db/drizzle");
  await db
    .insert(warmupSystemState)
    .values({
      systemName: WARMUP_SYSTEM_STATE_NAME,
      workerStatus: "stale",
    })
    .onConflictDoNothing({ target: warmupSystemState.systemName });
}

export async function recordWarmupActivity(entry: {
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  messageType: string;
  status: string;
  statusReason?: WarmupStatusReason;
  provider?: string;
  providerMessageId?: string | null;
  latencyMs?: number | null;
  attemptNumber?: number | null;
  errorMessage?: string;
  metadata?: Record<string, unknown> | null;
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
      sentAt: entry.sentAt ?? new Date(),
      status: entry.status,
      statusReason: entry.statusReason ?? null,
      attemptNumber: entry.attemptNumber ?? null,
      errorMessage: entry.errorMessage ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    console.error("[LGS Warmup] activity log error:", err);
  }
}

export async function recordWarmupSystemState(input: {
  lastWorkerRunAt?: Date | null;
  lastSuccessfulSendAt?: Date | null;
  workerStatus?: WarmupWorkerStatus;
  lastError?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { db } = await import("../../../db/drizzle");
  await ensureWarmupSystemStateRow();
  await db
    .update(warmupSystemState)
    .set({
      lastWorkerRunAt: input.lastWorkerRunAt ?? undefined,
      lastSuccessfulSendAt: input.lastSuccessfulSendAt ?? undefined,
      workerStatus: input.workerStatus ?? undefined,
      lastError: input.lastError ?? undefined,
      metadata: input.metadata ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(warmupSystemState.systemName, WARMUP_SYSTEM_STATE_NAME));
}

export async function maybeAlertOnStaleWarmupWorker(input?: {
  workerRow?: WarmupWorkerRecord | null;
  systemStateRow?: WarmupSystemStateRecord | null;
  now?: Date;
}): Promise<boolean> {
  const { db } = await import("../../../db/drizzle");
  const now = input?.now ?? new Date();
  await Promise.all([ensureWarmupWorkerHealthRow(), ensureWarmupSystemStateRow()]);

  const workerRow =
    input?.workerRow ??
    (await db
      .select()
      .from(lgsWorkerHealth)
      .where(eq(lgsWorkerHealth.workerName, WARMUP_WORKER_NAME))
      .limit(1)
      .then((rows) => rows[0] ?? null));
  const systemStateRow =
    input?.systemStateRow ??
    (await db
      .select()
      .from(warmupSystemState)
      .where(eq(warmupSystemState.systemName, WARMUP_SYSTEM_STATE_NAME))
      .limit(1)
      .then((rows) => rows[0] ?? null));

  const lastHeartbeatAt = workerRow?.lastHeartbeatAt ?? systemStateRow?.lastWorkerRunAt ?? null;
  const heartbeatAgeMs = lastHeartbeatAt ? now.getTime() - new Date(lastHeartbeatAt).getTime() : Infinity;
  const workerStatus: WarmupWorkerStatus = heartbeatAgeMs <= WARMUP_HEARTBEAT_STALE_MS ? "healthy" : "stale";

  await recordWarmupSystemState({
    lastWorkerRunAt: systemStateRow?.lastWorkerRunAt ?? workerRow?.lastRunFinishedAt ?? null,
    lastSuccessfulSendAt: systemStateRow?.lastSuccessfulSendAt ?? null,
    workerStatus,
  });

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
  await Promise.all([ensureWarmupWorkerHealthRow(), ensureWarmupSystemStateRow()]);

  const managedSenders = await db
    .select()
    .from(senderPool)
    .where(or(eq(senderPool.warmupStatus, "warming"), eq(senderPool.warmupStatus, "ready")));

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
    const plan = buildWarmupSenderRepairPlan({
      sender,
      latestActivity,
      activityRows: senderActivityRows,
      now,
      hasValidToken: sender.gmailConnected,
    });

    if (Object.keys(plan.updates).length > 0) {
      await db
        .update(senderPool)
        .set({ ...plan.updates, updatedAt: now })
        .where(eq(senderPool.id, sender.id));
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
  const activityRows =
    senderEmails.length === 0
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
  const activityRows =
    senderEmails.length === 0
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
