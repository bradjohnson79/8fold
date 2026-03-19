import { describe, expect, it } from "vitest";
import {
  buildWarmupSenderDashboardRow,
  buildWarmupSummaryRow,
  computeNextWarmupSendAt,
  computeWarmupScheduleState,
  evaluateWarmupSend,
  getWarmupNextSendState,
  getWarmupWorkerStatus,
  validateWarmupSystemSnapshot,
  WARMUP_HEARTBEAT_STALE_MS,
  WARMUP_RETRY_DELAY_MS,
  type WarmupActivityRecord,
  type WarmupSenderRecord,
  type WarmupWorkerRecord,
} from "../warmupSystem";

function createSender(overrides: Partial<WarmupSenderRecord> = {}): WarmupSenderRecord {
  const now = new Date("2026-03-18T12:00:00.000Z");
  return {
    id: "sender-1",
    senderEmail: "info@8fold.app",
    gmailRefreshToken: "refresh-token",
    gmailAccessToken: null,
    gmailTokenExpiresAt: null,
    gmailConnected: true,
    dailyLimit: 10,
    sentToday: 0,
    lastSentAt: null,
    status: "active",
    warmupStatus: "warming",
    warmupStartedAt: now,
    warmupDay: 1,
    warmupEmailsSentToday: 0,
    warmupTotalReplies: 0,
    warmupTotalSent: 0,
    warmupInboxPlacement: "good",
    currentDayStartedAt: now,
    outreachSentToday: 0,
    warmupSentToday: 0,
    outreachEnabled: false,
    cooldownUntil: null,
    healthScore: "unknown",
    warmupIntervalAnchorAt: now,
    nextWarmupSendAt: new Date("2026-03-18T16:00:00.000Z"),
    lastWarmupSentAt: null,
    lastWarmupResult: null,
    lastWarmupRecipient: null,
    warmupSendingAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createActivity(overrides: Partial<WarmupActivityRecord> = {}): WarmupActivityRecord {
  return {
    id: 1,
    senderEmail: "info@8fold.app",
    recipientEmail: "brad@aetherx.co",
    subject: "Warmup test",
    messageType: "external",
    provider: "gmail",
    providerMessageId: "msg-1",
    latencyMs: 850,
    sentAt: new Date("2026-03-18T12:30:00.000Z"),
    status: "sent",
    statusReason: "sent",
    attemptNumber: 1,
    errorMessage: null,
    metadata: null,
    createdAt: new Date("2026-03-18T12:30:00.000Z"),
    ...overrides,
  };
}

function createWorker(overrides: Partial<WarmupWorkerRecord> = {}): WarmupWorkerRecord {
  const now = Date.now();
  return {
    id: 1,
    workerName: "warmup",
    lastHeartbeatAt: new Date(now - 60_000),
    lastRunStartedAt: new Date(now - 60_000),
    lastRunFinishedAt: new Date(now - 30_000),
    lastRunStatus: "completed",
    lastError: null,
    configCheckResult: null,
    ...overrides,
  };
}

describe("warmup interval scheduling", () => {
  it("produces a deterministic interval per sender cycle", () => {
    const sender = createSender();
    const schedule1 = computeWarmupScheduleState({ sender, now: new Date("2026-03-18T12:00:00.000Z") });
    const schedule2 = computeWarmupScheduleState({ sender, now: new Date("2026-03-18T12:30:00.000Z") });

    expect(schedule1.intervalSeconds).toBe(schedule2.intervalSeconds);
    expect(schedule1.intervalSeconds).toBeGreaterThanOrEqual((4 * 60 * 60) - (20 * 60));
    expect(schedule1.intervalSeconds).toBeLessThanOrEqual((4 * 60 * 60) + (20 * 60));
  });

  it("does not send before the interval elapses", () => {
    const sender = createSender({
      lastWarmupSentAt: new Date("2026-03-18T12:00:00.000Z"),
    });
    const evaluation = evaluateWarmupSend({
      sender,
      now: new Date("2026-03-18T14:00:00.000Z"),
    });

    expect(evaluation.shouldSend).toBe(false);
    expect(evaluation.reason).toBe("interval_not_met");
  });

  it("sends immediately when the interval is overdue", () => {
    const sender = createSender({
      lastWarmupSentAt: new Date("2026-03-18T12:00:00.000Z"),
    });
    const schedule = computeWarmupScheduleState({
      sender,
      now: new Date("2026-03-18T16:30:00.000Z"),
    });
    const evaluation = evaluateWarmupSend({
      sender,
      now: new Date(schedule.regularDueAt.getTime() + (2 * 60 * 1000)),
    });

    expect(evaluation.shouldSend).toBe(true);
    expect(evaluation.reason).toBe("recovered_missed_send");
  });

  it("schedules a retry 15 minutes after a failure without waiting for the next interval", () => {
    const sender = createSender({
      lastWarmupSentAt: new Date("2026-03-18T12:00:00.000Z"),
    });
    const failedActivity = createActivity({
      status: "failed",
      statusReason: "failed_provider_error",
      sentAt: new Date("2026-03-18T12:10:00.000Z"),
      errorMessage: "smtp timeout",
    });

    const evaluation = evaluateWarmupSend({
      sender,
      activityRows: [failedActivity],
      now: new Date("2026-03-18T12:26:00.000Z"),
    });

    expect(evaluation.shouldSend).toBe(true);
    expect(evaluation.reason).toBe("retry_due");
    expect(evaluation.retryDueAt?.getTime()).toBe(
      failedActivity.sentAt.getTime() + WARMUP_RETRY_DELAY_MS,
    );
  });

  it("computes next send time from last send plus interval", () => {
    const lastWarmupSentAt = new Date("2026-03-18T12:00:00.000Z");
    const nextWarmupSendAt = computeNextWarmupSendAt({
      senderId: "sender-1",
      warmupStatus: "warming",
      warmupDay: 1,
      dailyLimit: 10,
      warmupTotalSent: 1,
      warmupSentToday: 1,
      outreachSentToday: 0,
      currentDayStartedAt: new Date("2026-03-18T12:00:00.000Z"),
      warmupStartedAt: new Date("2026-03-18T12:00:00.000Z"),
      lastWarmupSentAt: new Date("2026-03-18T12:00:00.000Z"),
      outreachEnabled: false,
      now: new Date("2026-03-18T12:01:00.000Z"),
    });

    expect(nextWarmupSendAt.getTime()).toBeGreaterThan(lastWarmupSentAt.getTime());
  });

  it("does not accumulate drift when a delayed send succeeds late", () => {
    const actualSendAt = new Date("2026-03-18T16:20:00.000Z");
    const sender = createSender({
      warmupTotalSent: 1,
      warmupIntervalAnchorAt: new Date("2026-03-18T12:00:00.000Z"),
      lastWarmupSentAt: actualSendAt,
      nextWarmupSendAt: new Date("2026-03-18T16:10:00.000Z"),
    });

    const schedule = computeWarmupScheduleState({
      sender,
      now: new Date("2026-03-18T16:25:00.000Z"),
    });

    expect(schedule.regularDueAt.getTime()).toBeLessThan(actualSendAt.getTime());
  });

  it("respects an active rate-limit backoff without changing the regular cadence", () => {
    const sender = createSender({
      warmupTotalSent: 1,
      warmupIntervalAnchorAt: new Date("2026-03-18T12:00:00.000Z"),
      nextWarmupSendAt: new Date("2026-03-18T16:25:00.000Z"),
      lastWarmupResult: "skipped",
    });

    const evaluation = evaluateWarmupSend({
      sender,
      now: new Date("2026-03-18T16:15:00.000Z"),
    });

    expect(evaluation.shouldSend).toBe(false);
    expect(evaluation.reason).toBe("rate_limit_backoff");
    expect(evaluation.nextActionAt.toISOString()).toBe("2026-03-18T16:25:00.000Z");
  });
});

describe("warmup dashboard and validation", () => {
  it("maps dashboard rows with next send state", () => {
    const sender = createSender({
      lastWarmupSentAt: new Date("2026-03-18T12:00:00.000Z"),
    });
    const activity = createActivity();
    const row = buildWarmupSenderDashboardRow({
      sender,
      latestActivity: activity,
      activityRows: [activity],
      now: new Date("2026-03-18T13:00:00.000Z"),
    });

    expect(row.email).toBe("info@8fold.app");
    expect(row.next_warmup_send_at).not.toBeNull();
    expect(row.next_send_state).toBe("scheduled");
    expect(row.last_activity_status).toBe("sent");
  });

  it("marks retry pending when the next action is a retry", () => {
    const sender = createSender({
      lastWarmupSentAt: new Date("2026-03-18T12:00:00.000Z"),
      lastWarmupResult: "error",
    });
    const failedActivity = createActivity({
      status: "failed",
      statusReason: "failed_provider_error",
      sentAt: new Date("2026-03-18T12:10:00.000Z"),
      errorMessage: "smtp timeout",
    });

    const state = getWarmupNextSendState({
      sender,
      latestActivity: failedActivity,
      activityRows: [failedActivity],
      now: new Date("2026-03-18T12:20:00.000Z"),
    });

    expect(state).toBe("retry_pending");
  });

  it("builds summary rows with worker health", () => {
    const sender = createSender();
    const activity = createActivity();
    const row = buildWarmupSenderDashboardRow({
      sender,
      latestActivity: activity,
      activityRows: [activity],
    });

    const summary = buildWarmupSummaryRow({
      senders: [row],
      workerRow: createWorker(),
      recentActivity: activity,
      recentActivityRows: [activity],
      pendingQueueCount: 2,
    });

    expect(summary.worker_status).toBe("healthy");
    expect(summary.pending_queue_count).toBe(2);
    expect(summary.next_system_warmup_send_at).not.toBeNull();
  });

  it("fails validation when the worker heartbeat is stale", () => {
    const sender = createSender();
    const activity = createActivity();
    const validation = validateWarmupSystemSnapshot({
      senders: [sender],
      latestActivityBySender: new Map([[sender.senderEmail, activity]]),
      recentActivity: activity,
      workerRow: createWorker({
        lastHeartbeatAt: new Date(Date.now() - WARMUP_HEARTBEAT_STALE_MS - 60_000),
      }),
      now: new Date("2026-03-18T13:00:00.000Z"),
    });

    expect(validation.pass).toBe(false);
    expect(validation.reasons.some((reason) => reason.includes("stale"))).toBe(true);
  });
});

describe("worker health helpers", () => {
  it("classifies worker heartbeat freshness", () => {
    expect(getWarmupWorkerStatus(new Date(Date.now() - 60_000))).toBe("healthy");
    expect(getWarmupWorkerStatus(new Date(Date.now() - WARMUP_HEARTBEAT_STALE_MS - 1_000))).toBe("stale");
  });
});
