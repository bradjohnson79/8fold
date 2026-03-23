/**
 * LGS Outreach Brain: Warmup-aware scheduler with intelligent sender selection.
 *
 * Safety layers (preserved from prior implementation):
 *   - Per-sender: outreach_enabled gate, warmup_status check, daily limit, hourly cap (5/hr),
 *     per-minute cap (1/min/sender), min interval (6-8 min), cooldown kill-switch
 *   - Global: MAX_GLOBAL_PER_MINUTE (10), domain daily limit, send window (9am-5pm PT),
 *     queue backpressure warning
 *   - Bounce feedback: auto-cooldown if bounce rate > 5%
 *
 * Brain additions:
 *   - Scored sender selection with weighted randomness (no "teacher's pet" dominance)
 *   - Queue ordered by lead_priority rank (high → medium → low)
 *   - Domain cooldown: normalized website domain, fallback to email domain
 *   - State machine gate: skip replied/converted/paused/archived leads
 *   - Brain settings integration: min_lead_score_to_queue, min_sender_health_level
 *   - Machine-readable reason codes for queue intelligence UI
 *   - Lead state updates on successful send
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  jobPosterEmailQueue,
  jobPosterLeads,
  leadFinderCampaigns,
  lgsOutreachQueue,
  lgsOutreachSettings,
  outreachMessages,
  senderPool,
} from "@/db/schema/directoryEngine";
import { syncCampaignDomainReplyRate } from "./priorityScoringService";
import {
  hasGmailTokenForSender,
  sendOutreachEmail,
  type SendResult,
} from "./outreachGmailSenderService";

// ── Shared constant: sender health severity order ─────────────────────────────
// Index 0 = best, index 2 = worst. Exported for use in warmup worker and UI.
export const SENDER_HEALTH_ORDER = ["good", "warning", "risk"] as const;
export type SenderHealthLevel = (typeof SENDER_HEALTH_ORDER)[number];

// ── Machine-readable queue reason codes ───────────────────────────────────────
export type QueueReasonCode =
  | "priority_high"
  | "priority_medium"
  | "priority_low"
  | "sender_capacity_ok"
  | "blocked_no_capacity"
  | "blocked_domain_cooldown"
  | "blocked_sender_health"
  | "blocked_stage_replied"
  | "blocked_stage_converted"
  | "blocked_stage_paused"
  | "blocked_stage_archived"
  | "blocked_score_threshold"
  | "send_window_closed";

export const QUEUE_REASON_LABELS: Record<QueueReasonCode, string> = {
  priority_high: "High Priority",
  priority_medium: "Medium Priority",
  priority_low: "Low Priority",
  sender_capacity_ok: "Capacity Available",
  blocked_no_capacity: "Blocked: No Sender Capacity",
  blocked_domain_cooldown: "Blocked: Domain Cooldown",
  blocked_sender_health: "Blocked: Sender Health",
  blocked_stage_replied: "Blocked: Lead Replied",
  blocked_stage_converted: "Blocked: Lead Converted",
  blocked_stage_paused: "Blocked: Lead Paused",
  blocked_stage_archived: "Blocked: Lead Archived",
  blocked_score_threshold: "Blocked: Score Below Threshold",
  send_window_closed: "Blocked: Outside Send Window",
};

// ── Safety constants ──────────────────────────────────────────────────────────
const LGS_DOMAIN_DAILY_LIMIT = Number(process.env.LGS_DOMAIN_DAILY_LIMIT) || 220;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 30 * 1000;
const HOURLY_CAP = 5;
const MAX_PER_MINUTE_PER_SENDER = 1;
const MAX_GLOBAL_PER_MINUTE = 10;
const SEND_WINDOW_START_HOUR = 9;
const SEND_WINDOW_END_HOUR = 17;
const QUEUE_BACKPRESSURE_THRESHOLD = 500;
const BOUNCE_COOLDOWN_HOURS = 6;
const BOUNCE_RATE_THRESHOLD = 0.05;
const BOUNCE_LOOKBACK_COUNT = 20;

// ── Brain settings cache (refreshed each scheduler run) ──────────────────────
export type BrainSettings = {
  minLeadScoreToQueue: number;
  domainCooldownDays: number;
  followup1DelayDays: number;
  followup2DelayDays: number;
  maxFollowupsPerLead: number;
  minSenderHealthLevel: SenderHealthLevel;
};

const DEFAULT_SETTINGS: BrainSettings = {
  minLeadScoreToQueue: 0,
  domainCooldownDays: 7,
  followup1DelayDays: 4,
  followup2DelayDays: 6,
  maxFollowupsPerLead: 2,
  minSenderHealthLevel: "risk",
};

export async function loadBrainSettings(): Promise<BrainSettings> {
  try {
    const [row] = await db.select().from(lgsOutreachSettings).limit(1);
    if (!row) return DEFAULT_SETTINGS;
    return {
      minLeadScoreToQueue: row.minLeadScoreToQueue,
      domainCooldownDays: row.domainCooldownDays,
      followup1DelayDays: row.followup1DelayDays,
      followup2DelayDays: row.followup2DelayDays,
      maxFollowupsPerLead: row.maxFollowupsPerLead,
      minSenderHealthLevel: (SENDER_HEALTH_ORDER.includes(row.minSenderHealthLevel as SenderHealthLevel)
        ? row.minSenderHealthLevel
        : "risk") as SenderHealthLevel,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function minutesSince(date: Date | null): number {
  if (!date) return Infinity;
  return (Date.now() - date.getTime()) / (60 * 1000);
}

function isWithinSendWindow(): boolean {
  const ptOffset = -8;
  const now = new Date();
  const utcHour = now.getUTCHours();
  const ptHour = (utcHour + ptOffset + 24) % 24;
  return ptHour >= SEND_WINDOW_START_HOUR && ptHour < SEND_WINDOW_END_HOUR;
}

/** Extract normalized domain from a website URL or email, for cooldown checks. */
export function getCompanyDomain(website: string | null, email: string): string | null {
  if (website) {
    try {
      const url = website.startsWith("http") ? website : `https://${website}`;
      const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      if (host.includes(".")) return host;
    } catch { /* fall through */ }
  }
  const emailDomain = email.split("@")[1];
  return emailDomain?.toLowerCase() ?? null;
}

/** Check if the domain was contacted too recently. */
export async function isDomainOnCooldown(
  companyDomain: string,
  cooldownDays: number,
  excludeLeadId: string,
  pipeline: "contractor" | "jobs" = "contractor"
): Promise<boolean> {
  if (!companyDomain || cooldownDays <= 0) return false;
  const cutoff = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
  const [contractorRow] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(contractorLeads)
    .where(
      and(
        pipeline === "contractor" ? sql`${contractorLeads.id} != ${excludeLeadId}` : sql`true`,
        sql`${contractorLeads.lastContactedAt} >= ${cutoff}`,
        sql`(
          (${contractorLeads.website} IS NOT NULL AND lower(regexp_replace(regexp_replace(${contractorLeads.website}, '^https?://(www\\.)?', ''), '/.*$', '')) = ${companyDomain})
          OR
          (${contractorLeads.website} IS NULL AND split_part(lower(${contractorLeads.email}), '@', 2) = ${companyDomain})
        )`
      )
    );
  const [jobPosterRow] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(jobPosterLeads)
    .where(
      and(
        pipeline === "jobs" ? sql`${jobPosterLeads.id} != ${excludeLeadId}` : sql`true`,
        sql`${jobPosterLeads.lastContactedAt} >= ${cutoff}`,
        sql`(
          lower(regexp_replace(regexp_replace(${jobPosterLeads.website}, '^https?://(www\\.)?', ''), '/.*$', '')) = ${companyDomain}
          OR
          (${jobPosterLeads.email} IS NOT NULL AND split_part(lower(${jobPosterLeads.email}), '@', 2) = ${companyDomain})
        )`
      )
    );
  return Number(contractorRow?.cnt ?? 0) > 0 || Number(jobPosterRow?.cnt ?? 0) > 0;
}

// ── Global rate check ─────────────────────────────────────────────────────────

async function checkGlobalPerMinute(): Promise<boolean> {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const [contractorRow] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(lgsOutreachQueue)
    .where(
      and(
        eq(lgsOutreachQueue.sendStatus, "sent"),
        sql`${lgsOutreachQueue.sentAt} >= ${oneMinuteAgo}`
      )
    );
  const [jobPosterRow] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(jobPosterEmailQueue)
    .where(
      and(
        eq(jobPosterEmailQueue.status, "sent"),
        sql`${jobPosterEmailQueue.sentAt} >= ${oneMinuteAgo}`
      )
    );
  return Number(contractorRow?.cnt ?? 0) + Number(jobPosterRow?.cnt ?? 0) < MAX_GLOBAL_PER_MINUTE;
}

// ── Bounce detection ──────────────────────────────────────────────────────────

async function checkBounceRate(senderEmail: string): Promise<{ exceeded: boolean; rate: number }> {
  const [contractorRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      bounced: sql<number>`count(*) filter (where ${lgsOutreachQueue.errorMessage} is not null and ${lgsOutreachQueue.errorMessage} ~* 'bounce|550|rejected|permanent')::int`,
    })
    .from(lgsOutreachQueue)
    .where(
      and(
        eq(lgsOutreachQueue.senderAccount, senderEmail),
        sql`${lgsOutreachQueue.sendStatus} in ('sent', 'failed')`
      )
    )
    .limit(1);

  const [jobPosterRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      bounced: sql<number>`count(*) filter (where ${jobPosterEmailQueue.errorMessage} is not null and ${jobPosterEmailQueue.errorMessage} ~* 'bounce|550|rejected|permanent')::int`,
    })
    .from(jobPosterEmailQueue)
    .where(
      and(
        eq(jobPosterEmailQueue.senderEmail, senderEmail),
        sql`${jobPosterEmailQueue.status} in ('sent', 'failed')`
      )
    )
    .limit(1);

  const total = Number(contractorRow?.total ?? 0) + Number(jobPosterRow?.total ?? 0);
  const bounced = Number(contractorRow?.bounced ?? 0) + Number(jobPosterRow?.bounced ?? 0);
  if (total < BOUNCE_LOOKBACK_COUNT) return { exceeded: false, rate: 0 };
  const rate = bounced / total;
  return { exceeded: rate > BOUNCE_RATE_THRESHOLD, rate };
}

// ── Scored sender selection with weighted randomness ──────────────────────────

type ScoredSender = {
  id: string;
  senderEmail: string;
  remaining: number;
  score: number;
};

function computeSenderScore(s: {
  remaining: number;
  dailyLimit: number;
  warmupTotalReplies: number;
  warmupTotalSent: number;
  healthScore: string | null;
}): number {
  const remainingRatio = s.dailyLimit > 0 ? s.remaining / s.dailyLimit : 0;
  const replyRate =
    s.warmupTotalSent > 0 ? Math.min(1, s.warmupTotalReplies / s.warmupTotalSent) : 0;

  const healthIdx = SENDER_HEALTH_ORDER.indexOf((s.healthScore ?? "risk") as SenderHealthLevel);
  const placementScore = healthIdx === 0 ? 1 : healthIdx === 1 ? 0.5 : 0;
  const bouncePenalty = healthIdx === 2 ? 0.5 : 0;

  return (
    remainingRatio * 0.4 +
    replyRate * 0.3 +
    placementScore * 0.2 -
    bouncePenalty
  );
}

/** Weighted random pick among top-N senders to prevent load concentration. */
function weightedRandomPick(candidates: ScoredSender[]): ScoredSender {
  const minScore = Math.min(...candidates.map((c) => c.score));
  // Shift to positive weights (add |min| + 0.01 so all weights are > 0)
  const weights = candidates.map((c) => c.score - minScore + 0.01);
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    rand -= weights[i]!;
    if (rand <= 0) return candidates[i]!;
  }
  return candidates[candidates.length - 1]!;
}

export async function selectAvailableSender(
  settings: BrainSettings
): Promise<{ id: string; senderEmail: string } | null> {
  if (!isWithinSendWindow()) return null;
  if (!(await checkGlobalPerMinute())) return null;

  const intervalMin = randomBetween(6, 8);

  const [domainTotalRow] = await db
    .select({ total: sql<number>`coalesce(sum(${senderPool.sentToday}), 0)::int` })
    .from(senderPool)
    .where(eq(senderPool.status, "active"));

  const domainTotal = Number(domainTotalRow?.total ?? 0);
  if (domainTotal >= LGS_DOMAIN_DAILY_LIMIT) return null;

  const senders = await db
    .select({
      id: senderPool.id,
      senderEmail: senderPool.senderEmail,
      sentToday: senderPool.sentToday,
      dailyLimit: senderPool.dailyLimit,
      lastSentAt: senderPool.lastSentAt,
      warmupStatus: senderPool.warmupStatus,
      outreachEnabled: senderPool.outreachEnabled,
      warmupSentToday: senderPool.warmupSentToday,
      outreachSentToday: senderPool.outreachSentToday,
      cooldownUntil: senderPool.cooldownUntil,
      healthScore: senderPool.healthScore,
      warmupTotalReplies: senderPool.warmupTotalReplies,
      warmupTotalSent: senderPool.warmupTotalSent,
    })
    .from(senderPool)
    .where(eq(senderPool.status, "active"));

  const eligible: ScoredSender[] = [];
  const now = new Date();
  const minHealthIdx = SENDER_HEALTH_ORDER.indexOf(settings.minSenderHealthLevel);

  for (const s of senders) {
    if (!s.outreachEnabled) continue;
    if (s.warmupStatus !== "warming" && s.warmupStatus !== "ready") continue;
    if (s.cooldownUntil && new Date(s.cooldownUntil) > now) continue;

    const totalSent = (s.warmupSentToday ?? 0) + (s.outreachSentToday ?? 0);
    const remaining = (s.dailyLimit ?? 0) - totalSent;
    if (remaining <= 0) continue;

    if (minutesSince(s.lastSentAt ?? null) < intervalMin) continue;
    if (!hasGmailTokenForSender(s.senderEmail ?? "")) continue;

    // Minimum sender health gate
    const senderHealthIdx = SENDER_HEALTH_ORDER.indexOf((s.healthScore ?? "risk") as SenderHealthLevel);
    if (senderHealthIdx > minHealthIdx) continue;

    // Per-minute cap per sender
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const [contractorMinuteRow] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(lgsOutreachQueue)
      .where(
        and(
          eq(lgsOutreachQueue.senderAccount, s.senderEmail ?? ""),
          eq(lgsOutreachQueue.sendStatus, "sent"),
          sql`${lgsOutreachQueue.sentAt} >= ${oneMinuteAgo}`
        )
      );
    const [jobPosterMinuteRow] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(jobPosterEmailQueue)
      .where(
        and(
          eq(jobPosterEmailQueue.senderEmail, s.senderEmail ?? ""),
          eq(jobPosterEmailQueue.status, "sent"),
          sql`${jobPosterEmailQueue.sentAt} >= ${oneMinuteAgo}`
        )
      );
    if (Number(contractorMinuteRow?.cnt ?? 0) + Number(jobPosterMinuteRow?.cnt ?? 0) >= MAX_PER_MINUTE_PER_SENDER) continue;

    // Per-hour cap
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [contractorHourRow] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(lgsOutreachQueue)
      .where(
        and(
          eq(lgsOutreachQueue.senderAccount, s.senderEmail ?? ""),
          eq(lgsOutreachQueue.sendStatus, "sent"),
          sql`${lgsOutreachQueue.sentAt} >= ${oneHourAgo}`
        )
      );
    const [jobPosterHourRow] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(jobPosterEmailQueue)
      .where(
        and(
          eq(jobPosterEmailQueue.senderEmail, s.senderEmail ?? ""),
          eq(jobPosterEmailQueue.status, "sent"),
          sql`${jobPosterEmailQueue.sentAt} >= ${oneHourAgo}`
        )
      );
    if (Number(contractorHourRow?.cnt ?? 0) + Number(jobPosterHourRow?.cnt ?? 0) >= HOURLY_CAP) continue;

    const score = computeSenderScore({
      remaining,
      dailyLimit: s.dailyLimit ?? 1,
      warmupTotalReplies: s.warmupTotalReplies ?? 0,
      warmupTotalSent: s.warmupTotalSent ?? 0,
      healthScore: s.healthScore,
    });

    eligible.push({ id: s.id, senderEmail: s.senderEmail ?? "", remaining, score });
  }

  if (eligible.length === 0) return null;

  // Sort by score descending, take top 3, pick via weighted random
  eligible.sort((a, b) => b.score - a.score);
  const topN = eligible.slice(0, 3);
  const selected = weightedRandomPick(topN);

  return { id: selected.id, senderEmail: selected.senderEmail };
}

// ── Queue fetch with brain priority ordering ──────────────────────────────────

async function fetchNextQueuedMessage(
  settings: BrainSettings
): Promise<{
  queueId: string;
  messageId: string;
  leadId: string;
  campaignId: string | null;
  email: string;
  subject: string;
  body: string;
  senderEmail: string;
  senderId: string;
  website: string | null;
  outreachStage: string | null;
  leadScore: number;
  leadPriority: string | null;
  priorityScore: number;
  emailVerificationStatus: string | null;
} | null> {
  const sender = await selectAvailableSender(settings);
  if (!sender) return null;

  // Send deterministically: valid email first, then oldest queued leads.
  const rows = await db
    .select({
      queueId: lgsOutreachQueue.id,
      messageId: outreachMessages.id,
      leadId: lgsOutreachQueue.leadId,
      campaignId: contractorLeads.campaignId,
      subject: outreachMessages.subject,
      body: outreachMessages.body,
      email: contractorLeads.email,
      website: contractorLeads.website,
      leadCreatedAt: contractorLeads.createdAt,
      outreachStage: contractorLeads.outreachStage,
      leadScore: contractorLeads.leadScore,
      leadPriority: contractorLeads.leadPriority,
      priorityScore: contractorLeads.priorityScore,
      replyCount: contractorLeads.replyCount,
      emailVerificationStatus: contractorLeads.emailVerificationStatus,
      archived: contractorLeads.archived,
    })
    .from(lgsOutreachQueue)
    .innerJoin(outreachMessages, eq(lgsOutreachQueue.outreachMessageId, outreachMessages.id))
    .innerJoin(contractorLeads, eq(lgsOutreachQueue.leadId, contractorLeads.id))
    .where(eq(lgsOutreachQueue.sendStatus, "pending"))
    .orderBy(
      asc(
        sql`CASE
          WHEN lower(coalesce(${contractorLeads.emailVerificationStatus}, 'pending')) IN ('valid', 'verified') THEN 0
          WHEN lower(coalesce(${contractorLeads.emailVerificationStatus}, 'pending')) = 'invalid' THEN 2
          ELSE 1
        END`
      ),
      asc(contractorLeads.createdAt),
      asc(
        sql`CASE ${contractorLeads.leadPriority}
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END`
      ),
      asc(lgsOutreachQueue.createdAt)
    )
    .limit(20)
    .for("update", { skipLocked: true });

  // Apply brain gates on the candidate list
  for (const row of rows) {
    if (!row.subject || !row.body || !row.email) continue;
    if (row.archived) continue;
    const verificationStatus = String(row.emailVerificationStatus ?? "").trim().toLowerCase();
    const isInvalid = verificationStatus === "invalid";
    const isValid = verificationStatus === "valid" || verificationStatus === "verified";
    if (isInvalid || !isValid) continue;

    // State machine gate
    const blockedStages = ["replied", "converted", "paused", "archived"];
    if (row.outreachStage && blockedStages.includes(row.outreachStage)) continue;

    // Domain cooldown gate
    const domain = getCompanyDomain(row.website, row.email);
    if (domain) {
      const onCooldown = await isDomainOnCooldown(domain, settings.domainCooldownDays, row.leadId);
      if (onCooldown) continue;
    }

    return {
      queueId: row.queueId,
      messageId: row.messageId,
      leadId: row.leadId,
      campaignId: row.campaignId,
      email: row.email.trim().toLowerCase(),
      subject: row.subject,
      body: row.body,
      senderEmail: sender.senderEmail,
      senderId: sender.id,
      website: row.website,
      outreachStage: row.outreachStage,
      leadScore: row.leadScore ?? 0,
      leadPriority: row.leadPriority,
      priorityScore: row.priorityScore ?? 0,
      emailVerificationStatus: row.emailVerificationStatus,
    };
  }

  return null;
}

// ── Send helpers ──────────────────────────────────────────────────────────────

export async function sendWithRetry(params: {
  subject: string;
  body: string;
  contactEmail: string;
  senderAccount: string;
}): Promise<SendResult> {
  let lastResult: SendResult = { ok: false, bounce: false, message: "No attempt" };
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    lastResult = await sendOutreachEmail(params);
    if (lastResult.ok) return lastResult;
    if (lastResult.bounce) return lastResult;
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  return lastResult;
}

export async function incrementOutreachCounter(senderId: string): Promise<void> {
  await db
    .update(senderPool)
    .set({
      outreachSentToday: sql`${senderPool.outreachSentToday} + 1`,
      sentToday: sql`${senderPool.warmupSentToday} + ${senderPool.outreachSentToday} + 1`,
      lastSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(senderPool.id, senderId));
}

export async function triggerBounceCooldown(
  senderId: string,
  senderEmail: string,
  bounceRate: number
): Promise<void> {
  const cooldownUntil = new Date(Date.now() + BOUNCE_COOLDOWN_HOURS * 60 * 60 * 1000);
  await db
    .update(senderPool)
    .set({ cooldownUntil, healthScore: "risk", updatedAt: new Date() })
    .where(eq(senderPool.id, senderId));
  console.warn(
    `[LGS Safety] ${senderEmail}: bounce rate ${(bounceRate * 100).toFixed(1)}% exceeded threshold — cooldown until ${cooldownUntil.toISOString()}`
  );
}

export async function addRandomDelay(): Promise<void> {
  const delayMs = randomBetween(2000, 8000);
  await new Promise((r) => setTimeout(r, delayMs));
}

// ── Main scheduler entry point ────────────────────────────────────────────────

export async function runLgsOutreachScheduler(): Promise<{ sent: number; failed: number }> {
  const settings = await loadBrainSettings();

  // Queue backpressure check
  const [pendingRow] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(lgsOutreachQueue)
    .where(eq(lgsOutreachQueue.sendStatus, "pending"));
  const pendingCount = Number(pendingRow?.cnt ?? 0);
  if (pendingCount > QUEUE_BACKPRESSURE_THRESHOLD) {
    console.warn(
      `[LGS Backpressure] Queue has ${pendingCount} pending messages (threshold: ${QUEUE_BACKPRESSURE_THRESHOLD}).`
    );
  }

  // 1. First: try lgs_outreach_queue (approved GPT messages with brain priority)
  const queued = await fetchNextQueuedMessage(settings);
  if (queued) {
    await addRandomDelay();

    const result = await sendWithRetry({
      subject: queued.subject,
      body: queued.body,
      contactEmail: queued.email,
      senderAccount: queued.senderEmail,
    });

    const now = new Date();

    if (result.ok) {
      await db
        .update(lgsOutreachQueue)
        .set({
          sendStatus: "sent",
          sentAt: now,
          senderAccount: queued.senderEmail,
          attempts: sql`coalesce(${lgsOutreachQueue.attempts}, 0) + 1`,
          errorMessage: null,
        })
        .where(eq(lgsOutreachQueue.id, queued.queueId));

      await db
        .update(outreachMessages)
        .set({ status: "sent" })
        .where(eq(outreachMessages.id, queued.messageId));

      // Update lead brain state on successful send
      const nextFollowupAt = new Date(
        now.getTime() + settings.followup1DelayDays * 24 * 60 * 60 * 1000
      );
      await db
        .update(contractorLeads)
        .set({
          contactAttempts: sql`${contractorLeads.contactAttempts} + 1`,
          emailDate: now,
          outreachStatus: "sent",
          outreachStage: "sent",
          lastContactedAt: now,
          nextFollowupAt,
          updatedAt: now,
        })
        .where(eq(contractorLeads.id, queued.leadId));

      if (queued.campaignId) {
        await db
          .update(leadFinderCampaigns)
          .set({ sentCount: sql`${leadFinderCampaigns.sentCount} + 1` })
          .where(eq(leadFinderCampaigns.id, queued.campaignId));
        await syncCampaignDomainReplyRate({
          pipeline: "contractor",
          campaignId: queued.campaignId,
          website: queued.website,
        });
      }

      await incrementOutreachCounter(queued.senderId);
      return { sent: 1, failed: 0 };
    }

    if (result.bounce) {
      await db
        .update(contractorLeads)
        .set({ emailBounced: true, bounceReason: result.message, outreachStatus: "failed", scoreDirty: true, updatedAt: now })
        .where(eq(contractorLeads.id, queued.leadId));

      if (queued.campaignId) {
        await db
          .update(leadFinderCampaigns)
          .set({ bounceCount: sql`${leadFinderCampaigns.bounceCount} + 1` })
          .where(eq(leadFinderCampaigns.id, queued.campaignId));
      }

      const { exceeded, rate } = await checkBounceRate(queued.senderEmail);
      if (exceeded) {
        await triggerBounceCooldown(queued.senderId, queued.senderEmail, rate);
      }
    }

    await db
      .update(lgsOutreachQueue)
      .set({
        attempts: sql`coalesce(${lgsOutreachQueue.attempts}, 0) + 1`,
        sendStatus: "failed",
        errorMessage: result.message,
      })
      .where(eq(lgsOutreachQueue.id, queued.queueId));

    await db
      .update(outreachMessages)
      .set({ status: "failed" })
      .where(eq(outreachMessages.id, queued.messageId));

    await db
      .update(contractorLeads)
      .set({
        outreachStatus: "failed",
        updatedAt: now,
      })
      .where(eq(contractorLeads.id, queued.leadId));

    return { sent: 0, failed: 1 };
  }
  return { sent: 0, failed: 0 };
}
