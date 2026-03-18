/**
 * LGS Warmup Worker.
 * Runs every 5 minutes. Responsibilities:
 *   1. Anchor-based 24-hour day advancement for warming/ready senders.
 *   2. Slot-based warmup email sending with external routing.
 *   3. Activity logging to lgs_warmup_activity.
 *   4. Stuck sender detection.
 *   5. Health score computation (GOOD / WARNING / RISK).
 *   6. Cooldown awareness (skip senders in cooldown).
 *   7. Worker heartbeat to lgs_worker_health.
 *
 *   DOTENV_CONFIG_PATH=apps/api/.env.local pnpm -C apps/api run lgs:warmup:worker
 */
import path from "node:path";
import cron from "node-cron";
import dotenv from "dotenv";
import { and, eq, gte, or, sql } from "drizzle-orm";
import { lgsWarmupActivity, senderPool, lgsWorkerHealth } from "../db/schema/directoryEngine";
import { sendOutreachEmail, hasGmailTokenForSender } from "../src/services/lgs/outreachGmailSenderService";

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local"),
});

import { getDailyLimit } from "../src/services/lgs/warmupSchedule";
import {
  checkSendEligibility,
  pickWarmupTarget,
  computeHealthScore,
} from "../src/services/lgs/warmupEngine";
import {
  computeNextWarmupSendAt,
  computeWarmupRetryAt,
  enforceWarmupSystemStateWithOptions,
  ensureWarmupWorkerHealthRow,
  maybeAlertOnStaleWarmupWorker,
  recordWarmupActivity,
  validateWarmupSystem,
} from "../src/services/lgs/warmupSystem";

const MAX_WARMUP_DAY = 5;
const STUCK_SENDER_HOURS = 2;
const WORKER_NAME = "warmup";
const WARMUP_DOMAIN_DAILY_CAP = Number.isFinite(Number(process.env.LGS_WARMUP_DOMAIN_DAILY_CAP))
  ? Number(process.env.LGS_WARMUP_DOMAIN_DAILY_CAP)
  : 25;
const RUN_ONCE = process.env.LGS_WARMUP_RUN_ONCE === "1";

const WARMUP_MESSAGES: Array<{ subject: string; body: string }> = [
  { subject: "Quick hello", body: "Hey, just wanted to say hi and make sure this inbox is set up correctly. All good here." },
  { subject: "Morning check-in", body: "Good morning — just confirming the email flow is working properly on this end." },
  { subject: "Hey there", body: "Hi! Touching base real quick. Hope everything is working well on your side." },
  { subject: "Quick question", body: "Did the last message come through okay? Just checking deliverability. Thanks!" },
  { subject: "Inbox test — did you get this?", body: "Quick check — did this email land in your inbox? Just making sure everything is connected." },
  { subject: "Any issues?", body: "Have you noticed any delivery issues lately? Just want to make sure our setup is solid." },
  { subject: "Confirming delivery", body: "Hey, confirming the connection is working. No action needed on your end." },
  { subject: "All clear", body: "Running a delivery test. This should arrive in your primary inbox. Let me know if not." },
  { subject: "Connection verified", body: "Just verified the connection — everything looks good from this side." },
  { subject: "Re: Inbox test", body: "Yep, came through fine. Everything looks good." },
  { subject: "Re: Quick check", body: "Got it — delivery confirmed on this end. Thanks for the check." },
  { subject: "Re: Morning check-in", body: "All good here too. Inbox is working perfectly." },
  { subject: "Checking in", body: "Just a quick ping to check deliverability. All good on your end?" },
  { subject: "Testing connection", body: "Testing delivery on this end. Reply if you see this. Thanks!" },
  { subject: "Friday check", body: "Quick end-of-week inbox verification. Hope all is well." },
  { subject: "Just verifying", body: "Hi there, just verifying the mail route is clean. No action needed." },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

async function getDb() {
  const { db } = await import("../db/drizzle");
  return db;
}

function formatClockTime(value: Date): string {
  return value.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getRecipientDomain(email: string): string {
  const [, domain = "unknown"] = email.trim().toLowerCase().split("@");
  return domain || "unknown";
}

function logWarmupTrace(stage: string, payload: Record<string, unknown>) {
  console.log(`[LGS Warmup][${stage}] ${JSON.stringify(payload)}`);
}

// ─── Worker Heartbeat ─────────────────────────────────────────────────

async function heartbeatStart(): Promise<void> {
  const now = new Date();
  const db = await getDb();
  await ensureWarmupWorkerHealthRow();
  await db
    .update(lgsWorkerHealth)
    .set({
      lastHeartbeatAt: now,
      lastRunStartedAt: now,
      lastRunStatus: "running",
    })
    .where(eq(lgsWorkerHealth.workerName, WORKER_NAME));
}

async function heartbeatFinish(status: string, error?: string): Promise<void> {
  const now = new Date();
  const db = await getDb();
  await ensureWarmupWorkerHealthRow();
  await db
    .update(lgsWorkerHealth)
    .set({
      lastHeartbeatAt: now,
      lastRunFinishedAt: now,
      lastRunStatus: status,
      lastError: error ?? null,
    })
    .where(eq(lgsWorkerHealth.workerName, WORKER_NAME));
}

// ─── Day Advancement ──────────────────────────────────────────────────

async function advanceDays(): Promise<void> {
  const db = await getDb();
  const senders = await db
    .select()
    .from(senderPool)
    .where(
      or(
        eq(senderPool.warmupStatus, "warming"),
        eq(senderPool.warmupStatus, "ready")
      )
    );

  const now = new Date();

  for (const sender of senders) {
    if (!sender.currentDayStartedAt) continue;

    let anchor = new Date(sender.currentDayStartedAt);
    let currentDay = sender.warmupDay ?? 0;
    let advanced = false;

    while (now.getTime() >= anchor.getTime() + 24 * 60 * 60 * 1000) {
      anchor = new Date(anchor.getTime() + 24 * 60 * 60 * 1000);
      currentDay = Math.min(currentDay + 1, MAX_WARMUP_DAY);
      advanced = true;
    }

    if (!advanced) continue;

    const newLimit = getDailyLimit(currentDay);
    const outreachEnabled = currentDay >= 5;
    const warmupStatus = currentDay >= MAX_WARMUP_DAY ? "ready" : "warming";

    await db
      .update(senderPool)
      .set({
        warmupDay: currentDay,
        dailyLimit: newLimit,
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

    console.log(
      `[LGS Warmup] ${sender.senderEmail}: advanced to day ${currentDay}, limit=${newLimit}, outreach=${outreachEnabled ? "enabled" : "locked"}, status=${warmupStatus}`
    );
  }
}

// ─── Warmup Email Sending ──────────────────────────────────────────────

async function sendWarmupEmails(): Promise<void> {
  const db = await getDb();
  const senders = await db
    .select()
    .from(senderPool)
    .where(
      or(
        eq(senderPool.warmupStatus, "warming"),
        eq(senderPool.warmupStatus, "ready")
      )
    );

  const now = new Date();
  const recentSentRows = await db
    .select({
      recipientEmail: lgsWarmupActivity.recipientEmail,
    })
    .from(lgsWarmupActivity)
    .where(
      and(
        eq(lgsWarmupActivity.status, "sent"),
        gte(lgsWarmupActivity.sentAt, new Date(now.getTime() - 24 * 60 * 60 * 1000))
      )
    );
  const domainSendCounts = new Map<string, number>();
  for (const row of recentSentRows) {
    const domain = getRecipientDomain(row.recipientEmail);
    domainSendCounts.set(domain, (domainSendCounts.get(domain) ?? 0) + 1);
  }

  for (const sender of senders) {
    const email = sender.senderEmail ?? "";
    const warmupDay = sender.warmupDay ?? 1;
    const persistedNextWarmupSendAt = sender.nextWarmupSendAt ?? null;
    const persistedDue = !!persistedNextWarmupSendAt && persistedNextWarmupSendAt.getTime() <= now.getTime();

    // Skip senders in cooldown
    if (sender.cooldownUntil && new Date(sender.cooldownUntil) > now) {
      const nextScheduledAt = computeNextWarmupSendAt({
        warmupStatus: sender.warmupStatus,
        warmupDay: sender.warmupDay,
        dailyLimit: sender.dailyLimit,
        warmupSentToday: sender.warmupSentToday,
        outreachSentToday: sender.outreachSentToday,
        currentDayStartedAt: sender.currentDayStartedAt,
        warmupStartedAt: sender.warmupStartedAt,
        outreachEnabled: sender.outreachEnabled,
        cooldownUntil: sender.cooldownUntil,
        hasValidToken: true,
        now,
      });
      logWarmupTrace("sender_evaluated", {
        sender_email: email,
        now: now.toISOString(),
        next_warmup_send_at: persistedNextWarmupSendAt?.toISOString() ?? null,
        due: persistedDue,
        reason: "cooldown",
      });
      console.log(`[LGS Warmup] Scheduling ${email} -> ${formatClockTime(nextScheduledAt)} (cooldown)`);
      await db.update(senderPool).set({
        lastWarmupResult: "skipped",
        nextWarmupSendAt: nextScheduledAt,
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));
      continue;
    }

    const totalSent = (sender.warmupSentToday ?? 0) + (sender.outreachSentToday ?? 0);
    const remaining = (sender.dailyLimit ?? 0) - totalSent;
    if (remaining <= 0) {
      const nextScheduledAt = computeNextWarmupSendAt({
        warmupStatus: sender.warmupStatus,
        warmupDay: sender.warmupDay,
        dailyLimit: sender.dailyLimit,
        warmupSentToday: sender.warmupSentToday,
        outreachSentToday: sender.outreachSentToday,
        currentDayStartedAt: sender.currentDayStartedAt,
        warmupStartedAt: sender.warmupStartedAt,
        outreachEnabled: sender.outreachEnabled,
        hasValidToken: true,
        now,
      });
      logWarmupTrace("sender_evaluated", {
        sender_email: email,
        now: now.toISOString(),
        next_warmup_send_at: persistedNextWarmupSendAt?.toISOString() ?? null,
        due: persistedDue,
        reason: "capacity_exhausted",
      });
      console.log(`[LGS Warmup] Scheduling ${email} -> ${formatClockTime(nextScheduledAt)} (capacity exhausted)`);
      await db.update(senderPool).set({
        lastWarmupResult: "skipped",
        nextWarmupSendAt: nextScheduledAt,
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));
      continue;
    }

    const warmupBudget = sender.outreachEnabled
      ? Math.min(3, remaining)
      : remaining;

    const warmupSentSoFar = sender.warmupSentToday ?? 0;
    if (warmupSentSoFar >= warmupBudget) {
      const nextScheduledAt = computeNextWarmupSendAt({
        warmupStatus: sender.warmupStatus,
        warmupDay: sender.warmupDay,
        dailyLimit: sender.dailyLimit,
        warmupSentToday: sender.warmupSentToday,
        outreachSentToday: sender.outreachSentToday,
        currentDayStartedAt: sender.currentDayStartedAt,
        warmupStartedAt: sender.warmupStartedAt,
        outreachEnabled: sender.outreachEnabled,
        hasValidToken: true,
        now,
      });
      logWarmupTrace("sender_evaluated", {
        sender_email: email,
        now: now.toISOString(),
        next_warmup_send_at: persistedNextWarmupSendAt?.toISOString() ?? null,
        due: persistedDue,
        reason: "warmup_quota_reached",
      });
      console.log(`[LGS Warmup] Scheduling ${email} -> ${formatClockTime(nextScheduledAt)} (warmup quota reached)`);
      await db.update(senderPool).set({
        lastWarmupResult: "skipped",
        nextWarmupSendAt: nextScheduledAt,
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));
      continue;
    }

    const hasValidToken = await hasGmailTokenForSender(email);
    if (!hasValidToken) {
      const retryAt = computeWarmupRetryAt(now);
      logWarmupTrace("sender_evaluated", {
        sender_email: email,
        now: now.toISOString(),
        next_warmup_send_at: persistedNextWarmupSendAt?.toISOString() ?? null,
        due: persistedDue,
        reason: "missing_token",
      });
      console.warn(`[LGS Warmup] ${email}: missing_token, retry at ${formatClockTime(retryAt)}`);
      await db.update(senderPool).set({
        lastWarmupResult: "error",
        nextWarmupSendAt: retryAt,
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));
      await recordWarmupActivity({
        senderEmail: email,
        recipientEmail: sender.lastWarmupRecipient ?? email,
        subject: "Warmup token validation failed",
        messageType: "system",
        status: "failed",
        provider: "gmail",
        errorMessage: "missing_token",
        sentAt: now,
      });
      logWarmupTrace("activity_inserted", {
        sender_email: email,
        now: now.toISOString(),
        next_warmup_send_at: persistedNextWarmupSendAt?.toISOString() ?? null,
        due: persistedDue,
        selected_recipient: sender.lastWarmupRecipient ?? email,
        send_result: "missing_token",
        activity_status: "failed",
        next_send_persisted: retryAt.toISOString(),
      });
      continue;
    }

    // ── Slot-based time gate ───────────────────────────────────────────
    const eligibility = checkSendEligibility({
      currentDayStartedAt: sender.currentDayStartedAt,
      warmupSentToday: warmupSentSoFar,
      warmupBudget,
    });

    const computedNextScheduledAt = eligibility.nextSendAt ?? computeWarmupRetryAt(now);
    const effectiveNextWarmupSendAt = persistedNextWarmupSendAt ?? computedNextScheduledAt;
    const due = effectiveNextWarmupSendAt.getTime() <= now.getTime();
    if (!persistedNextWarmupSendAt) {
      console.log(`[LGS Warmup] Scheduling ${email} -> ${formatClockTime(computedNextScheduledAt)}`);
      await db.update(senderPool).set({
        nextWarmupSendAt: computedNextScheduledAt,
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));
    }

    const nextEligibleMin = Math.round(eligibility.nextEligibleMs / 60_000);

    logWarmupTrace("sender_evaluated", {
      sender_email: email,
      now: now.toISOString(),
      next_warmup_send_at: effectiveNextWarmupSendAt.toISOString(),
      due,
      eligibility_allowed: eligibility.allowed,
      eligibility_next_send_at: computedNextScheduledAt.toISOString(),
      warmup_sent_today: warmupSentSoFar,
      warmup_budget: warmupBudget,
    });

    console.log(
      `[LGS Warmup] ${email}: dayProgress=${(eligibility.dayProgress * 100).toFixed(1)}%` +
      ` expectedProgress=${(eligibility.expectedProgress * 100).toFixed(1)}%` +
      ` sent=${warmupSentSoFar}/${warmupBudget}` +
      ` decision=${due ? "SEND" : `WAIT (~${nextEligibleMin}m)`}`
    );

    if (!due) {
      await db.update(senderPool).set({
        lastWarmupResult: "wait",
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));
      continue;
    }

    // ── Pick target (internal/external routing) ────────────────────────
    const targetResult = pickWarmupTarget(
      email,
      sender.lastWarmupRecipient ?? null,
      warmupDay,
    );

    if (!targetResult.target) {
      const retryAt = computeWarmupRetryAt(now);
      logWarmupTrace("target_selected", {
        sender_email: email,
        now: now.toISOString(),
        next_warmup_send_at: effectiveNextWarmupSendAt.toISOString(),
        due,
        selected_recipient: null,
        send_result: "no_valid_target",
      });
      console.warn(`[LGS Warmup] ${email}: no valid target — ${(targetResult as { reason: string }).reason}`);
      await db.update(senderPool).set({
        lastWarmupResult: "skipped",
        nextWarmupSendAt: retryAt,
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));
      continue;
    }

    const { target: targetEmail, isExternal } = targetResult;
    const msg = pickRandom(WARMUP_MESSAGES);
    const routeType = isExternal ? "external" : "internal";
    const targetDomain = getRecipientDomain(targetEmail);
    const domainSentToday = domainSendCounts.get(targetDomain) ?? 0;
    const senderRemaining = Math.max(0, remaining);
    const dailyLimitForDay = Math.max(0, warmupBudget - warmupSentSoFar);
    const domainRemaining = Math.max(0, WARMUP_DOMAIN_DAILY_CAP - domainSentToday);
    const actualSend = Math.min(domainRemaining, senderRemaining, dailyLimitForDay);
    logWarmupTrace("target_selected", {
      sender_email: email,
      now: now.toISOString(),
      next_warmup_send_at: effectiveNextWarmupSendAt.toISOString(),
      due,
      selected_recipient: targetEmail,
      route_type: routeType,
      domain_remaining: domainRemaining,
      sender_remaining: senderRemaining,
      daily_limit_remaining: dailyLimitForDay,
      actual_send: actualSend,
    });

    if (actualSend <= 0) {
      const retryAt = computeWarmupRetryAt(now);
      const domainGuardReason = `Domain guardrail reached for ${targetDomain} (${domainSentToday}/${WARMUP_DOMAIN_DAILY_CAP} in last 24h).`;
      console.warn(`[LGS Warmup] ${email}: ${domainGuardReason}`);
      await db.update(senderPool).set({
        lastWarmupResult: "skipped",
        lastWarmupRecipient: targetEmail,
        nextWarmupSendAt: retryAt,
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));
      await recordWarmupActivity({
        senderEmail: email,
        recipientEmail: targetEmail,
        subject: msg.subject,
        messageType: routeType,
        status: "skipped",
        provider: "gmail",
        errorMessage: domainGuardReason,
        sentAt: now,
      });
      logWarmupTrace("activity_inserted", {
        sender_email: email,
        now: now.toISOString(),
        next_warmup_send_at: effectiveNextWarmupSendAt.toISOString(),
        due,
        selected_recipient: targetEmail,
        send_result: "guardrail_blocked",
        activity_status: "skipped",
        next_send_persisted: retryAt.toISOString(),
      });
      console.log(`[LGS Warmup] Next send scheduled -> ${formatClockTime(retryAt)}`);
      continue;
    }

    logWarmupTrace("send_attempt_entered", {
      sender_email: email,
      now: now.toISOString(),
      next_warmup_send_at: effectiveNextWarmupSendAt.toISOString(),
      due,
      selected_recipient: targetEmail,
      route_type: routeType,
    });
    console.log(`[LGS Warmup] Sending ${email} -> ${targetEmail} (${routeType})`);

    try {
      const sendStartedAt = Date.now();
      const result = await sendOutreachEmail({
        subject: msg.subject,
        body: msg.body,
        contactEmail: targetEmail,
        senderAccount: email,
      });
      const latencyMs = Date.now() - sendStartedAt;

      if (result.ok) {
        const newWarmupSent = warmupSentSoFar + 1;
        const newTotal = newWarmupSent + (sender.outreachSentToday ?? 0);

        const nextScheduledAfterSend = computeNextWarmupSendAt({
          warmupStatus: sender.warmupStatus,
          warmupDay: sender.warmupDay,
          dailyLimit: sender.dailyLimit,
          warmupSentToday: newWarmupSent,
          outreachSentToday: sender.outreachSentToday,
          currentDayStartedAt: sender.currentDayStartedAt,
          warmupStartedAt: sender.warmupStartedAt,
          outreachEnabled: sender.outreachEnabled,
          hasValidToken: true,
          now,
        });

        await db
          .update(senderPool)
          .set({
            warmupSentToday: newWarmupSent,
            warmupEmailsSentToday: sql`${senderPool.warmupEmailsSentToday} + 1`,
            warmupTotalSent: sql`${senderPool.warmupTotalSent} + 1`,
            sentToday: newTotal,
            lastSentAt: now,
            lastWarmupSentAt: now,
            lastWarmupResult: "sent",
            lastWarmupRecipient: targetEmail,
            nextWarmupSendAt: nextScheduledAfterSend,
            updatedAt: now,
          })
          .where(eq(senderPool.id, sender.id));

        await recordWarmupActivity({
          senderEmail: email,
          recipientEmail: targetEmail,
          subject: msg.subject,
          messageType: routeType,
          status: "sent",
          provider: "gmail",
          providerMessageId: result.messageId,
          latencyMs,
        });
        domainSendCounts.set(targetDomain, domainSentToday + 1);
        logWarmupTrace("activity_inserted", {
          sender_email: email,
          now: now.toISOString(),
          next_warmup_send_at: effectiveNextWarmupSendAt.toISOString(),
          due,
          selected_recipient: targetEmail,
          send_attempt_entered: true,
          send_result: "sent",
          activity_status: "sent",
          provider_message_id: result.messageId,
          next_send_persisted: nextScheduledAfterSend.toISOString(),
        });

        console.log(`[LGS Warmup] Success ${email}${result.messageId ? ` (${result.messageId})` : ""}`);
        console.log(`[LGS Warmup] Next send scheduled -> ${formatClockTime(nextScheduledAfterSend)}`);
      } else {
        const errMsg = (result as { message?: string }).message ?? "unknown";
        const retryAt = computeWarmupRetryAt(now);

        await db.update(senderPool).set({
          lastWarmupResult: "error",
          lastWarmupRecipient: targetEmail,
          nextWarmupSendAt: retryAt,
          updatedAt: now,
        }).where(eq(senderPool.id, sender.id));

        await recordWarmupActivity({
          senderEmail: email,
          recipientEmail: targetEmail,
          subject: msg.subject,
          messageType: routeType,
          status: "failed",
          provider: "gmail",
          latencyMs,
          errorMessage: errMsg,
        });
        logWarmupTrace("activity_inserted", {
          sender_email: email,
          now: now.toISOString(),
          next_warmup_send_at: effectiveNextWarmupSendAt.toISOString(),
          due,
          selected_recipient: targetEmail,
          send_attempt_entered: true,
          send_result: "failed",
          activity_status: "failed",
          error_message: errMsg,
          next_send_persisted: retryAt.toISOString(),
        });

        console.warn(`[LGS Warmup] ${email} → ${targetEmail} send failed: ${errMsg}`);
        console.log(`[LGS Warmup] Next send scheduled -> ${formatClockTime(retryAt)}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const retryAt = computeWarmupRetryAt(now);

      await db.update(senderPool).set({
        lastWarmupResult: "error",
        lastWarmupRecipient: targetEmail,
        nextWarmupSendAt: retryAt,
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));

      await recordWarmupActivity({
        senderEmail: email,
        recipientEmail: targetEmail,
        subject: msg.subject,
        messageType: routeType,
        status: "failed",
        provider: "gmail",
        errorMessage: errMsg,
      });
      logWarmupTrace("activity_inserted", {
        sender_email: email,
        now: now.toISOString(),
        next_warmup_send_at: effectiveNextWarmupSendAt.toISOString(),
        due,
        selected_recipient: targetEmail,
        send_attempt_entered: true,
        send_result: "exception",
        activity_status: "failed",
        error_message: errMsg,
        next_send_persisted: retryAt.toISOString(),
      });

      console.error(`[LGS Warmup] ${email} warmup send error:`, err);
      console.log(`[LGS Warmup] Next send scheduled -> ${formatClockTime(retryAt)}`);
    }
  }
}

// ─── Stuck Sender Detection ────────────────────────────────────────────

async function detectStuckSenders(): Promise<void> {
  const db = await getDb();
  const senders = await db
    .select()
    .from(senderPool)
    .where(eq(senderPool.warmupStatus, "warming"));

  const now = new Date();
  const stuckThresholdMs = STUCK_SENDER_HOURS * 60 * 60 * 1000;

  for (const sender of senders) {
    const totalSent = (sender.warmupSentToday ?? 0) + (sender.outreachSentToday ?? 0);
    if (totalSent > 0) continue;

    const lastActivity = sender.lastSentAt ?? sender.currentDayStartedAt;
    if (!lastActivity) continue;

    const sinceLastActivity = now.getTime() - new Date(lastActivity).getTime();
    if (sinceLastActivity > stuckThresholdMs) {
      console.warn(
        `[LGS Stuck] ${sender.senderEmail}: warming day ${sender.warmupDay}, sent_today=0, no activity for ${Math.round(sinceLastActivity / 60000)}min — check Gmail token or network`
      );
    }
  }
}

// ─── Health Score Computation ──────────────────────────────────────────

async function updateHealthScores(): Promise<void> {
  const db = await getDb();
  const senders = await db
    .select()
    .from(senderPool)
    .where(
      or(
        eq(senderPool.warmupStatus, "warming"),
        eq(senderPool.warmupStatus, "ready")
      )
    );

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
        .set({ healthScore: score, updatedAt: new Date() })
        .where(eq(senderPool.id, sender.id));
    }
  }
}

// ─── Main Cycle ────────────────────────────────────────────────────────

async function runWarmupCycle(): Promise<void> {
  try {
    await maybeAlertOnStaleWarmupWorker();
  } catch (err) {
    console.error("[LGS Warmup] stale worker alert check error:", err);
  }

  try {
    await heartbeatStart();
  } catch (err) {
    console.error("[LGS Warmup] heartbeat start error:", err);
  }

  let cycleError: string | undefined;

  try {
    await advanceDays();
  } catch (err) {
    console.error("[LGS Warmup] day advancement error:", err);
    cycleError = err instanceof Error ? err.message : String(err);
  }

  try {
    await enforceWarmupSystemStateWithOptions({ logMissedSchedules: false });
  } catch (err) {
    console.error("[LGS Warmup] invariant enforcement error:", err);
    cycleError = err instanceof Error ? err.message : String(err);
  }

  try {
    await sendWarmupEmails();
  } catch (err) {
    console.error("[LGS Warmup] warmup send error:", err);
    cycleError = cycleError ?? (err instanceof Error ? err.message : String(err));
  }

  try {
    await enforceWarmupSystemStateWithOptions({ logMissedSchedules: true });
  } catch (err) {
    console.error("[LGS Warmup] post-send missed schedule enforcement error:", err);
    cycleError = cycleError ?? (err instanceof Error ? err.message : String(err));
  }

  try {
    await detectStuckSenders();
  } catch (err) {
    console.error("[LGS Warmup] stuck detection error:", err);
  }

  try {
    await updateHealthScores();
  } catch (err) {
    console.error("[LGS Warmup] health score error:", err);
  }

  try {
    await heartbeatFinish(cycleError ? "error" : "completed", cycleError);
  } catch (err) {
    console.error("[LGS Warmup] heartbeat finish error:", err);
  }

  try {
    const validation = await validateWarmupSystem();
    if (!validation.pass) {
      const message = validation.reasons.join(" | ");
      console.error(`[LGS Warmup] post-run validation failed: ${message}`);
      await heartbeatFinish("error", message);
      throw new Error(message);
    }
    console.log(`[LGS Warmup] cycle validation PASS: ${validation.summary.senders_with_countdowns}/${validation.summary.warming_senders} warming senders scheduled`);
  } catch (err) {
    console.error("[LGS Warmup] post-run validation error:", err);
  }
}

if (RUN_ONCE) {
  void runWarmupCycle().then(() => {
    console.log("[LGS Warmup] Single run complete.");
    process.exit(0);
  }).catch((error) => {
    console.error("[LGS Warmup] Single run failed:", error);
    process.exit(1);
  });
} else {
  cron.schedule("*/5 * * * *", () => void runWarmupCycle(), {
    timezone: "America/Los_Angeles",
  });
  void runWarmupCycle();
  console.log("[LGS Warmup] Worker started. Cron: */5 * * * * (every 5 minutes)");
}

process.on("SIGINT", () => {
  console.log("[LGS Warmup] Shutting down...");
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("[LGS Warmup] Shutting down...");
  process.exit(0);
});
