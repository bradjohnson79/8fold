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
import { eq, or, sql } from "drizzle-orm";
import { db } from "../db/drizzle";
import { senderPool, lgsWarmupActivity, lgsWorkerHealth } from "../db/schema/directoryEngine";
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

const MAX_WARMUP_DAY = 5;
const STUCK_SENDER_HOURS = 2;
const WORKER_NAME = "warmup";

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

// ─── Activity Logging ─────────────────────────────────────────────────

async function logActivity(entry: {
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  messageType: string;
  status: string;
  errorMessage?: string;
}): Promise<void> {
  try {
    await db.insert(lgsWarmupActivity).values({
      senderEmail: entry.senderEmail,
      recipientEmail: entry.recipientEmail,
      subject: entry.subject,
      messageType: entry.messageType,
      status: entry.status,
      errorMessage: entry.errorMessage ?? null,
      sentAt: new Date(),
    });
  } catch (err) {
    console.error("[LGS Warmup] activity log error:", err);
  }
}

// ─── Worker Heartbeat ─────────────────────────────────────────────────

async function heartbeatStart(): Promise<void> {
  const now = new Date();
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
    const email = sender.senderEmail ?? "";
    const warmupDay = sender.warmupDay ?? 1;

    // Skip senders in cooldown
    if (sender.cooldownUntil && new Date(sender.cooldownUntil) > now) {
      console.log(`[LGS Warmup] ${email}: skipped (in cooldown until ${sender.cooldownUntil.toISOString()})`);
      await db.update(senderPool).set({
        lastWarmupResult: "skipped",
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));
      continue;
    }

    const totalSent = (sender.warmupSentToday ?? 0) + (sender.outreachSentToday ?? 0);
    const remaining = (sender.dailyLimit ?? 0) - totalSent;
    if (remaining <= 0) {
      await db.update(senderPool).set({
        lastWarmupResult: "skipped",
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));
      continue;
    }

    const warmupBudget = sender.outreachEnabled
      ? Math.min(3, remaining)
      : remaining;

    const warmupSentSoFar = sender.warmupSentToday ?? 0;
    if (warmupSentSoFar >= warmupBudget) {
      await db.update(senderPool).set({
        lastWarmupResult: "skipped",
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));
      continue;
    }

    if (!hasGmailTokenForSender(email)) {
      await db.update(senderPool).set({
        lastWarmupResult: "skipped",
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));
      continue;
    }

    // ── Slot-based time gate ───────────────────────────────────────────
    const eligibility = checkSendEligibility({
      currentDayStartedAt: sender.currentDayStartedAt,
      warmupSentToday: warmupSentSoFar,
      warmupBudget,
    });

    // Always persist next send timing
    await db.update(senderPool).set({
      nextWarmupSendAt: eligibility.nextSendAt,
      updatedAt: now,
    }).where(eq(senderPool.id, sender.id));

    const nextEligibleMin = Math.round(eligibility.nextEligibleMs / 60_000);

    console.log(
      `[LGS Warmup] ${email}: dayProgress=${(eligibility.dayProgress * 100).toFixed(1)}%` +
      ` expectedProgress=${(eligibility.expectedProgress * 100).toFixed(1)}%` +
      ` sent=${warmupSentSoFar}/${warmupBudget}` +
      ` decision=${eligibility.allowed ? "SEND" : `WAIT (~${nextEligibleMin}m)`}`
    );

    if (!eligibility.allowed) {
      await db.update(senderPool).set({
        lastWarmupResult: "wait",
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
      console.warn(`[LGS Warmup] ${email}: no valid target — ${(targetResult as { reason: string }).reason}`);
      await db.update(senderPool).set({
        lastWarmupResult: "skipped",
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));
      continue;
    }

    const { target: targetEmail, isExternal } = targetResult;
    const msg = pickRandom(WARMUP_MESSAGES);
    const routeType = isExternal ? "external" : "internal";

    console.log(`[LGS Warmup] ${email} → ${targetEmail} (${routeType}, day ${warmupDay})`);

    try {
      const result = await sendOutreachEmail({
        subject: msg.subject,
        body: msg.body,
        contactEmail: targetEmail,
        senderAccount: email,
      });

      if (result.ok) {
        const newWarmupSent = warmupSentSoFar + 1;
        const newTotal = newWarmupSent + (sender.outreachSentToday ?? 0);

        // Compute next slot timing for the NEXT email after this one
        const nextSlotEligibility = checkSendEligibility({
          currentDayStartedAt: sender.currentDayStartedAt,
          warmupSentToday: newWarmupSent,
          warmupBudget,
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
            nextWarmupSendAt: newWarmupSent >= warmupBudget ? null : nextSlotEligibility.nextSendAt,
            updatedAt: now,
          })
          .where(eq(senderPool.id, sender.id));

        await logActivity({
          senderEmail: email,
          recipientEmail: targetEmail,
          subject: msg.subject,
          messageType: routeType,
          status: "sent",
        });

        console.log(
          `[LGS Warmup] ${email} → ${targetEmail} sent (day ${warmupDay}, slot ${newWarmupSent}/${warmupBudget}, ${routeType})`
        );
      } else {
        const errMsg = (result as { message?: string }).message ?? "unknown";

        await db.update(senderPool).set({
          lastWarmupResult: "error",
          lastWarmupRecipient: targetEmail,
          updatedAt: now,
        }).where(eq(senderPool.id, sender.id));

        await logActivity({
          senderEmail: email,
          recipientEmail: targetEmail,
          subject: msg.subject,
          messageType: routeType,
          status: "failed",
          errorMessage: errMsg,
        });

        console.warn(`[LGS Warmup] ${email} → ${targetEmail} send failed: ${errMsg}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      await db.update(senderPool).set({
        lastWarmupResult: "error",
        lastWarmupRecipient: targetEmail,
        updatedAt: now,
      }).where(eq(senderPool.id, sender.id));

      await logActivity({
        senderEmail: email,
        recipientEmail: targetEmail,
        subject: msg.subject,
        messageType: routeType,
        status: "failed",
        errorMessage: errMsg,
      });

      console.error(`[LGS Warmup] ${email} warmup send error:`, err);
    }
  }
}

// ─── Stuck Sender Detection ────────────────────────────────────────────

async function detectStuckSenders(): Promise<void> {
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
    await sendWarmupEmails();
  } catch (err) {
    console.error("[LGS Warmup] warmup send error:", err);
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
}

cron.schedule("*/5 * * * *", () => void runWarmupCycle(), {
  timezone: "America/Los_Angeles",
});
void runWarmupCycle();

console.log("[LGS Warmup] Worker started. Cron: */5 * * * * (every 5 minutes)");

process.on("SIGINT", () => {
  console.log("[LGS Warmup] Shutting down...");
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("[LGS Warmup] Shutting down...");
  process.exit(0);
});
