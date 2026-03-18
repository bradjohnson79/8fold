import { describe, expect, it } from "vitest";
import {
  buildWarmupConfidence,
  buildWarmupSenderDashboardRow,
  buildWarmupSenderRepairPlan,
  buildWarmupSummaryRow,
  computeNextWarmupSendAt,
  explainNoRecentWarmupActivity,
  getWarmupWorkerStatus,
  hasMissedScheduledSend,
  validateWarmupSystemSnapshot,
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
    gmailRefreshToken: null,
    gmailAccessToken: null,
    gmailTokenExpiresAt: null,
    gmailConnected: false,
    dailyLimit: 5,
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
    nextWarmupSendAt: new Date("2026-03-18T13:12:00.000Z"),
    lastWarmupSentAt: null,
    lastWarmupResult: null,
    lastWarmupRecipient: null,
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
    errorMessage: null,
    createdAt: new Date("2026-03-18T12:30:00.000Z"),
    ...overrides,
  };
}

function createWorker(overrides: Partial<WarmupWorkerRecord> = {}): WarmupWorkerRecord {
  return {
    id: 1,
    workerName: "warmup",
    lastHeartbeatAt: new Date(Date.now() - 2 * 60 * 1000),
    lastRunStartedAt: new Date(Date.now() - 2 * 60 * 1000),
    lastRunFinishedAt: new Date(Date.now() - 60 * 1000),
    lastRunStatus: "completed",
    lastError: null,
    configCheckResult: null,
    ...overrides,
  };
}

describe("warmup invariant enforcement", () => {
  it("repairs warming senders so countdown fields always exist", () => {
    const now = new Date("2026-03-18T12:00:00.000Z");
    const sender = createSender({
      currentDayStartedAt: null,
      dailyLimit: 0,
      nextWarmupSendAt: null,
      warmupDay: 1,
    });

    const plan = buildWarmupSenderRepairPlan({
      sender,
      latestActivity: null,
      now,
      hasValidToken: true,
    });

    expect(plan.updates.currentDayStartedAt).toBeTruthy();
    expect(plan.updates.dailyLimit).toBe(5);
    expect(plan.updates.nextWarmupSendAt).toBeInstanceOf(Date);
  });

  it("uses retry delay when a send fails and must be retried", () => {
    const now = new Date("2026-03-18T12:00:00.000Z");
    const retryAt = computeNextWarmupSendAt({
      warmupStatus: "warming",
      warmupDay: 2,
      dailyLimit: 10,
      warmupSentToday: 1,
      outreachSentToday: 0,
      currentDayStartedAt: now,
      outreachEnabled: false,
      retryFromNow: true,
      now,
    });

    expect(retryAt.getTime()).toBe(now.getTime() + WARMUP_RETRY_DELAY_MS);
  });

  it("flags missed schedules and requests a recovery log", () => {
    const now = new Date("2026-03-18T15:00:00.000Z");
    const sender = createSender({
      nextWarmupSendAt: new Date("2026-03-18T13:00:00.000Z"),
      lastWarmupResult: "wait",
    });

    const plan = buildWarmupSenderRepairPlan({
      sender,
      latestActivity: createActivity({ sentAt: new Date("2026-03-18T12:00:00.000Z") }),
      now,
      hasValidToken: true,
    });

    expect(plan.shouldLogMissedSchedule).toBe(true);
    expect(plan.updates.lastWarmupResult).toBe("missed_schedule");
    expect(plan.updates.nextWarmupSendAt).toBeInstanceOf(Date);
    expect((plan.updates.nextWarmupSendAt as Date).getTime()).toBe(now.getTime() + WARMUP_RETRY_DELAY_MS);
  });
});

describe("warmup worker health helpers", () => {
  it("classifies worker heartbeat states", () => {
    expect(getWarmupWorkerStatus(new Date(Date.now() - 2 * 60 * 1000))).toBe("healthy");
    expect(getWarmupWorkerStatus(new Date(Date.now() - 12 * 60 * 1000))).toBe("warning");
    expect(getWarmupWorkerStatus(new Date(Date.now() - 25 * 60 * 1000))).toBe("stale");
  });
});

describe("warmup activity and dashboard contract", () => {
  it("maps sender dashboard rows with required fields", () => {
    const sender = createSender();
    const activity = createActivity();
    const row = buildWarmupSenderDashboardRow({
      sender,
      latestActivity: activity,
      activityRows: [activity],
    });

    expect(row.email).toBe("info@8fold.app");
    expect(row.warmup_day).toBe(1);
    expect(row.daily_limit).toBe(5);
    expect(row.next_warmup_send_at).not.toBeNull();
    expect(row.last_activity_status).toBe("sent");
    expect(row.last_activity_recipient).toBe("brad@aetherx.co");
    expect(row.is_delayed).toBe(false);
  });

  it("marks sender rows as delayed after schedule tolerance passes without activity", () => {
    const sender = createSender({
      nextWarmupSendAt: new Date("2026-03-18T12:00:00.000Z"),
    });
    const row = buildWarmupSenderDashboardRow({
      sender,
      latestActivity: createActivity({ sentAt: new Date("2026-03-18T11:30:00.000Z") }),
      activityRows: [],
      now: new Date("2026-03-18T12:06:00.000Z"),
    });

    expect(row.is_delayed).toBe(true);
    expect(row.dashboard_status).toBe("error");
  });

  it("builds summary rows with next send and worker state", () => {
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
      pendingQueueCount: 3,
    });

    expect(summary.next_system_warmup_send_at).not.toBeNull();
    expect(summary.worker_status).toBe("healthy");
    expect(summary.pending_queue_count).toBe(3);
    expect(summary.warmup_confidence).toBe("medium");
  });
});

describe("warmup confidence", () => {
  it("scores confidence high when recent sends succeed and heartbeat is healthy", () => {
    const confidence = buildWarmupConfidence({
      recentActivityRows: Array.from({ length: 10 }, (_, index) =>
        createActivity({
          id: index + 1,
          providerMessageId: `msg-${index + 1}`,
          sentAt: new Date(`2026-03-18T12:${String(index).padStart(2, "0")}:00.000Z`),
        })
      ),
      workerRow: createWorker(),
    });

    expect(confidence.level).toBe("high");
    expect(confidence.recentFailureCount).toBe(0);
    expect(confidence.failureFreeRecentRuns).toBe(true);
  });
});

describe("warmup validation gate", () => {
  it("passes when invariants are satisfied", () => {
    const sender = createSender();
    const activity = createActivity();
    const validation = validateWarmupSystemSnapshot({
      senders: [sender],
      latestActivityBySender: new Map([[sender.senderEmail, activity]]),
      recentActivity: activity,
      workerRow: createWorker(),
    });

    expect(validation.pass).toBe(true);
    expect(validation.reasons).toHaveLength(0);
  });

  it("fails when a warming sender has no countdown", () => {
    const sender = createSender({ nextWarmupSendAt: null });
    const validation = validateWarmupSystemSnapshot({
      senders: [sender],
      latestActivityBySender: new Map([[sender.senderEmail, null]]),
      recentActivity: null,
      workerRow: createWorker(),
      now: new Date("2026-03-18T12:10:00.000Z"),
    });

    expect(validation.pass).toBe(false);
    expect(validation.reasons.some((reason) => reason.includes("missing next_warmup_send_at"))).toBe(true);
  });

  it("fails when a sender drifts past its scheduled send time", () => {
    const sender = createSender({
      nextWarmupSendAt: new Date("2026-03-18T12:00:00.000Z"),
    });
    const validation = validateWarmupSystemSnapshot({
      senders: [sender],
      latestActivityBySender: new Map([[sender.senderEmail, createActivity({ sentAt: new Date("2026-03-18T11:30:00.000Z") })]]),
      recentActivity: createActivity({ sentAt: new Date("2026-03-18T11:30:00.000Z") }),
      workerRow: createWorker(),
      now: new Date("2026-03-18T12:10:00.000Z"),
    });

    expect(validation.pass).toBe(false);
    expect(validation.reasons.some((reason) => reason.includes("scheduled send window passed"))).toBe(true);
  });

  it("does not fail when senders are within execution tolerance but no recent activity exists", () => {
    const sender = createSender({
      nextWarmupSendAt: new Date("2026-03-18T12:00:00.000Z"),
    });
    const validation = validateWarmupSystemSnapshot({
      senders: [sender],
      latestActivityBySender: new Map([[sender.senderEmail, createActivity({ sentAt: new Date("2026-03-18T09:00:00.000Z") })]]),
      recentActivity: createActivity({ sentAt: new Date("2026-03-18T09:00:00.000Z") }),
      workerRow: createWorker(),
      now: new Date("2026-03-18T12:03:00.000Z"),
    });

    expect(validation.pass).toBe(true);
    expect(validation.reasons).toHaveLength(0);
    expect(validation.warnings).toContain("All warming senders are scheduled or within execution tolerance.");
  });
});

describe("missed schedule detection", () => {
  it("detects overdue schedules without matching activity", () => {
    expect(hasMissedScheduledSend({
      nextWarmupSendAt: new Date("2026-03-18T12:00:00.000Z"),
      latestActivityAt: new Date("2026-03-18T11:45:00.000Z"),
      now: new Date("2026-03-18T12:06:00.000Z"),
    })).toBe(true);
  });

  it("does not flag schedules that have matching later activity", () => {
    expect(hasMissedScheduledSend({
      nextWarmupSendAt: new Date("2026-03-18T12:00:00.000Z"),
      latestActivityAt: new Date("2026-03-18T12:02:00.000Z"),
      now: new Date("2026-03-18T12:10:00.000Z"),
    })).toBe(false);
  });

  it("waits until tolerance has passed before flagging delay", () => {
    expect(hasMissedScheduledSend({
      nextWarmupSendAt: new Date("2026-03-18T12:00:00.000Z"),
      latestActivityAt: null,
      now: new Date("2026-03-18T12:04:00.000Z"),
    })).toBe(false);
  });
});

describe("no recent activity explanation", () => {
  it("treats sends inside execution tolerance as scheduled", () => {
    const sender = createSender({
      nextWarmupSendAt: new Date("2026-03-18T12:00:00.000Z"),
    });

    expect(explainNoRecentWarmupActivity({
      senders: [sender],
      now: new Date("2026-03-18T12:03:00.000Z"),
    })).toBe("All warming senders are scheduled or within execution tolerance.");
  });
});
