import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { lgsWarmupActivity, lgsWorkerHealth, senderPool } from "@/db/schema/directoryEngine";
import {
  computeNextWarmupSendAt,
  computeWarmupRateLimitBackoffAt,
  computeWarmupRetryAt,
  ensureWarmupSystemStateRow,
  ensureWarmupWorkerHealthRow,
  evaluateWarmupSend,
  maybeAlertOnStaleWarmupWorker,
  recordWarmupActivity,
  recordWarmupSystemState,
  enforceWarmupSystemStateWithOptions,
  WARMUP_EMERGENCY_TRIGGER_MS,
  WARMUP_SEND_LOCK_STALE_MS,
  WARMUP_WORKER_NAME,
  type WarmupSenderRecord,
  type WarmupStatusReason,
} from "@/src/services/lgs/warmupSystem";
import { computeHealthScore, pickWarmupTarget } from "@/src/services/lgs/warmupEngine";
import { getDailyLimit, isReadyForOutreach } from "@/src/services/lgs/warmupSchedule";
import { hasGmailTokenForSender, sendOutreachEmail } from "@/src/services/lgs/outreachGmailSenderService";

const WORKER_LOOP_MS = 60 * 1000;
const WARMUP_DOMAIN_DAILY_CAP = Number.isFinite(Number(process.env.LGS_WARMUP_DOMAIN_DAILY_CAP))
  ? Number(process.env.LGS_WARMUP_DOMAIN_DAILY_CAP)
  : 25;
const MAX_WARMUP_DAY = 5;
const RECENT_REASON_DEDUPE_MS = 10 * 60 * 1000;

const WARMUP_MESSAGES: Array<{ subject: string; body: string }> = [
  { subject: "Quick hello", body: "Hey, just checking that this inbox is receiving mail normally." },
  { subject: "Morning check-in", body: "Good morning. Quick deliverability check from my side." },
  { subject: "Testing connection", body: "Running a quick warmup check to confirm this sender is healthy." },
  { subject: "All clear", body: "Inbox test. No action needed, just confirming consistent delivery." },
  { subject: "Quick question", body: "Did the last message land correctly? Just validating deliverability." },
  { subject: "Connection verified", body: "Warmup test from this sender. Everything should look normal." },
];

function pickRandom<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)]!;
}

function getRecipientDomain(email: string): string {
  const [, domain = "unknown"] = email.trim().toLowerCase().split("@");
  return domain || "unknown";
}

function shouldDedupeReason(latestActivity: typeof lgsWarmupActivity.$inferSelect | null, reason: WarmupStatusReason, now: Date): boolean {
  if (!latestActivity?.statusReason || latestActivity.statusReason !== reason || !latestActivity.sentAt) {
    return false;
  }
  return now.getTime() - new Date(latestActivity.sentAt).getTime() < RECENT_REASON_DEDUPE_MS;
}

async function claimWorkerRun(now: Date): Promise<Date | null> {
  await Promise.all([ensureWarmupWorkerHealthRow(), ensureWarmupSystemStateRow()]);
  const staleThreshold = new Date(now.getTime() - WARMUP_SEND_LOCK_STALE_MS);
  const rows = await db
    .update(lgsWorkerHealth)
    .set({
      lastHeartbeatAt: now,
      lastRunStartedAt: now,
      lastRunStatus: "running",
      lastError: null,
    })
    .where(
      and(
        eq(lgsWorkerHealth.workerName, WARMUP_WORKER_NAME),
        or(
          sql`${lgsWorkerHealth.lastRunStatus} is distinct from 'running'`,
          sql`${lgsWorkerHealth.lastRunStartedAt} is null`,
          sql`${lgsWorkerHealth.lastRunStartedAt} < ${staleThreshold}`,
        ),
      ),
    )
    .returning({ claimedAt: lgsWorkerHealth.lastRunStartedAt });

  if (rows.length === 0) {
    return null;
  }

  await recordWarmupSystemState({
    lastWorkerRunAt: now,
    workerStatus: "healthy",
    lastError: null,
  });

  return rows[0]?.claimedAt ?? now;
}

async function heartbeatFinish(claimedAt: Date, now: Date, status: "completed" | "error", errorMessage?: string): Promise<void> {
  await Promise.all([
    db
      .update(lgsWorkerHealth)
      .set({
        lastHeartbeatAt: now,
        lastRunFinishedAt: now,
        lastRunStatus: status,
        lastError: errorMessage ?? null,
      })
      .where(
        and(
          eq(lgsWorkerHealth.workerName, WARMUP_WORKER_NAME),
          eq(lgsWorkerHealth.lastRunStartedAt, claimedAt),
        ),
      ),
    recordWarmupSystemState({
      lastWorkerRunAt: now,
      workerStatus: "healthy",
      lastError: errorMessage ?? null,
    }),
  ]);
}

async function advanceWarmupDays(now: Date): Promise<void> {
  const senders = await db
    .select()
    .from(senderPool)
    .where(or(eq(senderPool.warmupStatus, "warming"), eq(senderPool.warmupStatus, "ready")));

  for (const sender of senders) {
    if (!sender.currentDayStartedAt) continue;

    let anchor = new Date(sender.currentDayStartedAt);
    let warmupDay = sender.warmupDay ?? 0;
    let advanced = false;

    while (now.getTime() >= anchor.getTime() + (24 * 60 * 60 * 1000)) {
      anchor = new Date(anchor.getTime() + (24 * 60 * 60 * 1000));
      warmupDay = Math.min(warmupDay + 1, MAX_WARMUP_DAY);
      advanced = true;
    }

    if (!advanced) continue;

    const dailyLimit = getDailyLimit(warmupDay);
    const outreachEnabled = isReadyForOutreach(warmupDay, dailyLimit);
    const warmupStatus = warmupDay >= MAX_WARMUP_DAY ? "ready" : "warming";

    await db
      .update(senderPool)
      .set({
        warmupDay,
        dailyLimit,
        currentDayStartedAt: anchor,
        warmupSentToday: 0,
        outreachSentToday: 0,
        sentToday: 0,
        warmupEmailsSentToday: 0,
        outreachEnabled,
        warmupStatus,
        updatedAt: now,
      })
      .where(eq(senderPool.id, sender.id));
  }
}

async function updateHealthScores(now: Date): Promise<void> {
  const senders = await db
    .select()
    .from(senderPool)
    .where(or(eq(senderPool.warmupStatus, "warming"), eq(senderPool.warmupStatus, "ready")));

  for (const sender of senders) {
    const score = computeHealthScore({
      warmupTotalSent: sender.warmupTotalSent ?? 0,
      warmupTotalReplies: sender.warmupTotalReplies ?? 0,
      warmupInboxPlacement: sender.warmupInboxPlacement ?? "unknown",
      cooldownUntil: sender.cooldownUntil ?? null,
    });
    if (score !== (sender.healthScore ?? "unknown")) {
      await db
        .update(senderPool)
        .set({ healthScore: score, updatedAt: now })
        .where(eq(senderPool.id, sender.id));
    }
  }
}

async function buildDomainSendCounts(now: Date): Promise<Map<string, number>> {
  const recentSentRows = await db
    .select({ recipientEmail: lgsWarmupActivity.recipientEmail })
    .from(lgsWarmupActivity)
    .where(
      and(
        eq(lgsWarmupActivity.status, "sent"),
        gte(lgsWarmupActivity.sentAt, new Date(now.getTime() - (24 * 60 * 60 * 1000))),
      ),
    );

  const counts = new Map<string, number>();
  for (const row of recentSentRows) {
    const domain = getRecipientDomain(row.recipientEmail);
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return counts;
}

async function claimSenderLock(senderId: string, now: Date): Promise<Date | null> {
  const staleThreshold = new Date(now.getTime() - WARMUP_SEND_LOCK_STALE_MS);
  const result = await db
    .update(senderPool)
    .set({ warmupSendingAt: now, updatedAt: now })
    .where(
      and(
        eq(senderPool.id, senderId),
        or(
          sql`${senderPool.warmupSendingAt} is null`,
          sql`${senderPool.warmupSendingAt} < ${staleThreshold}`,
        ),
      ),
    )
    .returning({ claimedAt: senderPool.warmupSendingAt });

  return result[0]?.claimedAt ?? null;
}

async function releaseSenderLock(senderId: string, claimedAt: Date, now: Date): Promise<void> {
  await db
    .update(senderPool)
    .set({ warmupSendingAt: null, updatedAt: now })
    .where(and(eq(senderPool.id, senderId), eq(senderPool.warmupSendingAt, claimedAt)));
}

async function logBlockedAttempt(input: {
  sender: WarmupSenderRecord;
  recipientEmail: string;
  subject: string;
  messageType: string;
  status: "skipped" | "failed";
  statusReason: WarmupStatusReason;
  errorMessage: string;
  attemptNumber: number;
  nextWarmupSendAt: Date;
  lockAcquiredAt: Date;
  now: Date;
}): Promise<void> {
  await db
    .update(senderPool)
    .set({
      lastWarmupResult: input.status === "skipped" ? "skipped" : "error",
      lastWarmupRecipient: input.recipientEmail,
      nextWarmupSendAt: input.nextWarmupSendAt,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(senderPool.id, input.sender.id),
        eq(senderPool.warmupSendingAt, input.lockAcquiredAt),
      ),
    );

  await recordWarmupActivity({
    senderEmail: input.sender.senderEmail,
    recipientEmail: input.recipientEmail,
    subject: input.subject,
    messageType: input.messageType,
    status: input.status,
    statusReason: input.statusReason,
    provider: "gmail",
    errorMessage: input.errorMessage,
    attemptNumber: input.attemptNumber,
    sentAt: input.now,
  });
}

async function processSender(input: {
  sender: WarmupSenderRecord;
  activityRows: typeof lgsWarmupActivity.$inferSelect[];
  latestActivity: typeof lgsWarmupActivity.$inferSelect | null;
  domainSendCounts: Map<string, number>;
  now: Date;
}): Promise<boolean> {
  const { sender, activityRows, latestActivity, domainSendCounts, now } = input;
  const evaluation = evaluateWarmupSend({ sender, activityRows, now });

  console.log("[LGS Warmup] Evaluating sender:", sender.id, sender.senderEmail);
  console.log("[LGS Warmup] Next send due at:", evaluation.nextActionAt.toISOString(), {
    regularDueAt: evaluation.regularDueAt.toISOString(),
    retryDueAt: evaluation.retryDueAt?.toISOString() ?? null,
    reason: evaluation.reason,
    shouldSend: evaluation.shouldSend,
  });
  if (!sender.nextWarmupSendAt || sender.nextWarmupSendAt.getTime() !== evaluation.nextActionAt.getTime()) {
    await db
      .update(senderPool)
      .set({ nextWarmupSendAt: evaluation.nextActionAt, updatedAt: now })
      .where(eq(senderPool.id, sender.id));
  }

  const dueNow =
    evaluation.regularDueAt <= now ||
    (evaluation.retryDueAt !== null && evaluation.retryDueAt <= now);

  if (!evaluation.shouldSend) {
    if (dueNow && evaluation.reason === "daily_rate_limit" && !shouldDedupeReason(latestActivity, "skipped_rate_limit", now)) {
      await recordWarmupActivity({
        senderEmail: sender.senderEmail,
        recipientEmail: sender.lastWarmupRecipient ?? sender.senderEmail,
        subject: "Warmup delayed by rate limit",
        messageType: "system",
        status: "skipped",
        statusReason: "skipped_rate_limit",
        errorMessage: "Warmup send delayed until sender/domain capacity resets.",
        attemptNumber: evaluation.consecutiveFailures + 1,
        sentAt: now,
      });
    }

    if (
      dueNow &&
      evaluation.reason === "sender_disconnected" &&
      !shouldDedupeReason(latestActivity, "failed_worker_error", now)
    ) {
      await recordWarmupActivity({
        senderEmail: sender.senderEmail,
        recipientEmail: sender.lastWarmupRecipient ?? sender.senderEmail,
        subject: "Warmup blocked: sender disconnected",
        messageType: "system",
        status: "failed",
        statusReason: "failed_worker_error",
        errorMessage: "gmail_connected is false for sender.",
        attemptNumber: evaluation.consecutiveFailures + 1,
        sentAt: now,
      });
    }

    console.log("[LGS Warmup] Sender not sent this cycle", {
      senderId: sender.id,
      senderEmail: sender.senderEmail,
      reason: evaluation.reason,
      dueNow,
    });
    return false;
  }

  const lockAcquiredAt = await claimSenderLock(sender.id, now);
  if (!lockAcquiredAt) {
    console.log("[LGS Warmup] Sender lock unavailable", {
      senderId: sender.id,
      senderEmail: sender.senderEmail,
    });
    return false;
  }

  try {
    const senderHasToken = await hasGmailTokenForSender(sender.senderEmail);
    if (!senderHasToken) {
      await logBlockedAttempt({
        sender,
        recipientEmail: sender.lastWarmupRecipient ?? sender.senderEmail,
        subject: "Warmup blocked: Gmail token missing",
        messageType: "system",
        status: "failed",
        statusReason: "failed_worker_error",
        errorMessage: "missing_token",
        attemptNumber: evaluation.consecutiveFailures + 1,
        nextWarmupSendAt: computeWarmupRetryAt(now),
        lockAcquiredAt,
        now,
      });
      return false;
    }

    const targetResult = pickWarmupTarget(
      sender.senderEmail,
      sender.lastWarmupRecipient ?? null,
      Math.max(1, sender.warmupDay ?? 1),
    );

    if (!targetResult.target) {
      await logBlockedAttempt({
        sender,
        recipientEmail: sender.lastWarmupRecipient ?? sender.senderEmail,
        subject: "Warmup blocked: no valid target",
        messageType: "system",
        status: "failed",
        statusReason: "failed_worker_error",
        errorMessage: "no_valid_target",
        attemptNumber: evaluation.consecutiveFailures + 1,
        nextWarmupSendAt: computeWarmupRetryAt(now),
        lockAcquiredAt,
        now,
      });
      return false;
    }

    const targetEmail = targetResult.target;
    const messageType = targetResult.isExternal ? "external" : "internal";
    const message = pickRandom(WARMUP_MESSAGES);
    const targetDomain = getRecipientDomain(targetEmail);
    const domainCount = domainSendCounts.get(targetDomain) ?? 0;

    if (domainCount >= WARMUP_DOMAIN_DAILY_CAP) {
      await logBlockedAttempt({
        sender,
        recipientEmail: targetEmail,
        subject: message.subject,
        messageType,
        status: "skipped",
        statusReason: "skipped_rate_limit",
        errorMessage: `Warmup domain cap reached for ${targetDomain}.`,
        attemptNumber: evaluation.consecutiveFailures + 1,
        nextWarmupSendAt: computeWarmupRateLimitBackoffAt({
          senderId: `${sender.id}:${targetDomain}`,
          now,
        }),
        lockAcquiredAt,
        now,
      });
      return false;
    }

    console.log("[LGS Warmup] Attempting warmup send for sender:", sender.id, sender.senderEmail);
    const sendStartedAt = Date.now();
    const result = await sendOutreachEmail({
      subject: message.subject,
      body: message.body,
      contactEmail: targetEmail,
      senderAccount: sender.senderEmail,
    });
    const latencyMs = Date.now() - sendStartedAt;

    if (!result.ok) {
      const nextWarmupSendAt = computeWarmupRetryAt(now);
      const reason: WarmupStatusReason = result.bounce ? "failed_provider_error" : "failed_provider_error";
      await db
        .update(senderPool)
        .set({
          lastWarmupResult: "error",
          lastWarmupRecipient: targetEmail,
          nextWarmupSendAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(senderPool.id, sender.id),
            eq(senderPool.warmupSendingAt, lockAcquiredAt),
          ),
        );

      await recordWarmupActivity({
        senderEmail: sender.senderEmail,
        recipientEmail: targetEmail,
        subject: message.subject,
        messageType,
        status: "failed",
        statusReason: reason,
        provider: "gmail",
        latencyMs,
        errorMessage: result.message,
        attemptNumber: evaluation.consecutiveFailures + 1,
        sentAt: now,
      });
      return false;
    }

    const nextWarmupSendAt = computeNextWarmupSendAt({
      senderId: sender.id,
      warmupStatus: sender.warmupStatus,
      warmupDay: sender.warmupDay,
      dailyLimit: sender.dailyLimit,
      warmupTotalSent: (sender.warmupTotalSent ?? 0) + 1,
      warmupSentToday: (sender.warmupSentToday ?? 0) + 1,
      outreachSentToday: sender.outreachSentToday,
      currentDayStartedAt: sender.currentDayStartedAt,
      warmupStartedAt: sender.warmupStartedAt,
      lastWarmupSentAt: evaluation.regularDueAt,
      outreachEnabled: sender.outreachEnabled,
      now,
    });
    const newWarmupSent = (sender.warmupSentToday ?? 0) + 1;
    const newSentToday = newWarmupSent + (sender.outreachSentToday ?? 0);

    await db
      .update(senderPool)
      .set({
        warmupSentToday: newWarmupSent,
        warmupEmailsSentToday: sql`${senderPool.warmupEmailsSentToday} + 1`,
        warmupTotalSent: sql`${senderPool.warmupTotalSent} + 1`,
        sentToday: newSentToday,
        lastSentAt: now,
        lastWarmupSentAt: now,
        warmupIntervalAnchorAt: evaluation.regularDueAt,
        lastWarmupResult: "sent",
        lastWarmupRecipient: targetEmail,
        nextWarmupSendAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(senderPool.id, sender.id),
          eq(senderPool.warmupSendingAt, lockAcquiredAt),
        ),
      );

    await recordWarmupActivity({
      senderEmail: sender.senderEmail,
      recipientEmail: targetEmail,
      subject: message.subject,
      messageType,
      status: "sent",
      statusReason: evaluation.reason === "recovered_missed_send" ? "recovered_missed_send" : "sent",
      provider: "gmail",
      providerMessageId: result.messageId,
      latencyMs,
      attemptNumber: evaluation.consecutiveFailures + 1,
      sentAt: now,
    });

    domainSendCounts.set(targetDomain, domainCount + 1);
    await recordWarmupSystemState({
      lastWorkerRunAt: now,
      lastSuccessfulSendAt: now,
      workerStatus: "healthy",
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logBlockedAttempt({
      sender,
      recipientEmail: sender.lastWarmupRecipient ?? sender.senderEmail,
      subject: "Warmup worker error",
      messageType: "system",
      status: "failed",
      statusReason: "failed_worker_error",
      errorMessage: message,
      attemptNumber: evaluation.consecutiveFailures + 1,
      nextWarmupSendAt: computeWarmupRetryAt(now),
      lockAcquiredAt,
      now,
    });
    return false;
  } finally {
    await releaseSenderLock(sender.id, lockAcquiredAt, now);
  }
}

export async function runWarmupWorkerCycle(): Promise<{
  processedSenders: number;
  sent: number;
}> {
  const now = new Date();
  console.log("[LGS Warmup] Worker cycle started");
  await maybeAlertOnStaleWarmupWorker({ now });
  const claimedAt = await claimWorkerRun(now);
  if (!claimedAt) {
    console.log("[LGS Warmup] Worker cycle skipped because another run is active");
    return { processedSenders: 0, sent: 0 };
  }

  let cycleError: string | undefined;
  let sentCount = 0;

  try {
    await advanceWarmupDays(now);
    await enforceWarmupSystemStateWithOptions({ now });

    const senders = await db
      .select()
      .from(senderPool)
      .where(or(eq(senderPool.warmupStatus, "warming"), eq(senderPool.warmupStatus, "ready")))
      .orderBy(senderPool.senderEmail);
    const senderEmails = senders.map((sender) => sender.senderEmail);
    const activities =
      senderEmails.length === 0
        ? []
        : await db
            .select()
            .from(lgsWarmupActivity)
            .where(inArray(lgsWarmupActivity.senderEmail, senderEmails))
            .orderBy(desc(lgsWarmupActivity.sentAt));

    const activityRowsBySender = new Map<string, typeof lgsWarmupActivity.$inferSelect[]>();
    const latestActivityBySender = new Map<string, typeof lgsWarmupActivity.$inferSelect | null>();
    for (const row of activities) {
      if (!latestActivityBySender.has(row.senderEmail)) {
        latestActivityBySender.set(row.senderEmail, row);
      }
      const rows = activityRowsBySender.get(row.senderEmail) ?? [];
      rows.push(row);
      activityRowsBySender.set(row.senderEmail, rows);
    }

    const domainSendCounts = await buildDomainSendCounts(now);

    for (const sender of senders) {
      const sentThisCycle = await processSender({
        sender,
        activityRows: activityRowsBySender.get(sender.senderEmail) ?? [],
        latestActivity: latestActivityBySender.get(sender.senderEmail) ?? null,
        domainSendCounts,
        now,
      });

      if (sentThisCycle) {
        sentCount += 1;
      }
    }

    await updateHealthScores(now);
  } catch (error) {
    cycleError = error instanceof Error ? error.message : String(error);
    console.error("[LGS Warmup] worker cycle error:", error);
  }

  await heartbeatFinish(claimedAt, new Date(), cycleError ? "error" : "completed", cycleError);

  if (cycleError) {
    throw new Error(cycleError);
  }

  const processedSenders = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(senderPool)
    .where(or(eq(senderPool.warmupStatus, "warming"), eq(senderPool.warmupStatus, "ready")))
    .then((rows) => Number(rows[0]?.count ?? 0));

  console.log("[LGS Warmup] Worker cycle completed", { processedSenders, sent: sentCount });
  return { processedSenders, sent: sentCount };
}

export async function ensureWarmupWorkerFresh(input?: {
  now?: Date;
  staleAfterMs?: number;
}): Promise<{ triggered: boolean; healthy: boolean }> {
  const now = input?.now ?? new Date();
  const staleAfterMs = input?.staleAfterMs ?? WARMUP_EMERGENCY_TRIGGER_MS;

  await Promise.all([ensureWarmupWorkerHealthRow(), ensureWarmupSystemStateRow()]);

  const [workerRow] = await db
    .select()
    .from(lgsWorkerHealth)
    .where(eq(lgsWorkerHealth.workerName, WARMUP_WORKER_NAME))
    .limit(1);

  const lastRunAt = workerRow?.lastHeartbeatAt ?? workerRow?.lastRunFinishedAt ?? workerRow?.lastRunStartedAt ?? null;
  const healthy = !!lastRunAt && now.getTime() - new Date(lastRunAt).getTime() <= staleAfterMs;
  if (healthy) {
    return { triggered: false, healthy: true };
  }

  await runWarmupWorkerCycle();
  return { triggered: true, healthy: false };
}

export function startWarmupWorkerLoop(): () => void {
  let disposed = false;
  let running = false;

  const tick = async () => {
    if (disposed || running) return;
    running = true;
    try {
      await runWarmupWorkerCycle();
    } catch (error) {
      console.error("[LGS Warmup] loop tick failed:", error);
    } finally {
      running = false;
    }
  };

  const interval = setInterval(() => void tick(), WORKER_LOOP_MS);
  void tick();

  return () => {
    disposed = true;
    clearInterval(interval);
  };
}
