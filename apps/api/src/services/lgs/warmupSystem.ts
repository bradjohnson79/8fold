import { desc, eq, inArray, or } from "drizzle-orm";
import {
  lgsWarmupActivity,
  lgsWorkerHealth,
  senderPool,
} from "../../../db/schema/directoryEngine";
import { hasGmailTokenForSender } from "./outreachGmailSenderService";
import { DAY_MS, checkSendEligibility } from "./warmupEngine";
import { getDailyLimit, isReadyForOutreach } from "./warmupSchedule";

export const WARMUP_WORKER_NAME = "warmup";
export const WARMUP_RETRY_DELAY_MS = 5 * 60 * 1000;
export const WARMUP_HEARTBEAT_HEALTHY_MS = 10 * 60 * 1000;
export const WARMUP_HEARTBEAT_STALE_MS = 20 * 60 * 1000;
export const WARMUP_ACTIVITY_RECENT_MS = 60 * 60 * 1000;

export type WarmupWorkerStatus = "healthy" | "warning" | "stale";
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
};

function toIso(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
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
}): boolean {
  if (!input.nextWarmupSendAt) return false;

  const now = input.now ?? new Date();
  if (now <= new Date(input.nextWarmupSendAt)) return false;

  return !input.latestActivityAt || new Date(input.latestActivityAt) < new Date(input.nextWarmupSendAt);
}

export function buildWarmupSenderRepairPlan(input: {
  sender: WarmupSenderRecord;
  latestActivity: WarmupActivityRecord | null;
  now?: Date;
  hasValidToken?: boolean;
}): WarmupSenderRepairPlan {
  const now = input.now ?? new Date();
  const sender = input.sender;
  const updates: Partial<typeof senderPool.$inferInsert> = {};

  if (!isWarmupManagedStatus(sender.warmupStatus)) {
    return { updates, shouldLogMissedSchedule: false };
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

  const missedSchedule = hasMissedScheduledSend({
    nextWarmupSendAt: sender.nextWarmupSendAt,
    latestActivityAt: input.latestActivity?.sentAt ?? null,
    now,
  });

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
    retryFromNow: missedSchedule,
    now,
  });

  if (!sender.nextWarmupSendAt || new Date(sender.nextWarmupSendAt).getTime() !== nextWarmupSendAt.getTime()) {
    updates.nextWarmupSendAt = nextWarmupSendAt;
  }

  if (missedSchedule) {
    updates.lastWarmupResult = "missed_schedule";
  }

  return {
    updates,
    shouldLogMissedSchedule:
      missedSchedule &&
      sender.lastWarmupResult !== "missed_schedule" &&
      input.latestActivity?.status !== "missed_schedule",
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
  const readyForOutreach = isReadyForOutreach(warmupDay, dailyLimit);

  let consecutiveFailures = 0;
  for (const activity of input.activityRows) {
    if (activity.status === "sent") break;
    consecutiveFailures += 1;
  }

  let dashboardStatus = sender.warmupStatus ?? "not_started";
  if (sender.lastWarmupResult === "missed_schedule" || sender.lastWarmupResult === "error" || consecutiveFailures > 0) {
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
    health_score: sender.healthScore ?? null,
    cooldown_until: toIso(sender.cooldownUntil),
    is_cooling_down: isCoolingDown,
  };
}

export function buildWarmupSummaryRow(input: {
  senders: WarmupSenderDashboardRow[];
  workerRow: WarmupWorkerRecord | null;
  recentActivity: WarmupActivityRecord | null;
  pendingQueueCount: number;
}): WarmupSummaryRow {
  const activeSenders = input.senders.filter((sender) => isWarmupManagedStatus(sender.warmup_status));
  const nextSystemWarmupSendAt = activeSenders
    .map((sender) => sender.next_warmup_send_at)
    .filter((value): value is string => value !== null)
    .sort()[0] ?? null;

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

  if (activeSenders.every((sender) => sender.nextWarmupSendAt && new Date(sender.nextWarmupSendAt) > now)) {
    return "All warming senders are scheduled for future sends.";
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

  if (warmingSenders.length > 0 && sendersWithFutureCountdowns === 0) {
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
      status: entry.status,
      errorMessage: entry.errorMessage ?? null,
      sentAt: entry.sentAt ?? new Date(),
    });
  } catch (err) {
    console.error("[LGS Warmup] activity log error:", err);
  }
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
  const { db } = await import("../../../db/drizzle");
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

  const { latestActivityBySender } = buildActivityMaps(activityRows);

  for (const sender of managedSenders) {
    const latestActivity = latestActivityBySender.get(sender.senderEmail) ?? null;
    const plan = buildWarmupSenderRepairPlan({
      sender,
      latestActivity,
      now,
      hasValidToken: hasGmailTokenForSender(sender.senderEmail),
    });

    if (Object.keys(plan.updates).length > 0) {
      await db
        .update(senderPool)
        .set({ ...plan.updates, updatedAt: now })
        .where(eq(senderPool.id, sender.id));
    }

    if (plan.shouldLogMissedSchedule) {
      await recordWarmupActivity({
        senderEmail: sender.senderEmail,
        recipientEmail: sender.lastWarmupRecipient ?? sender.senderEmail,
        subject: "Warmup schedule missed",
        messageType: "system",
        status: "missed_schedule",
        errorMessage: "Scheduled send window passed without logged activity.",
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
    pendingQueueCount: input.pendingQueueCount,
  });

  return { data, summary };
}
