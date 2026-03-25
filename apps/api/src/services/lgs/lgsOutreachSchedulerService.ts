/**
 * LGS outreach scheduler.
 *
 * Runtime behavior:
 *   - Only sends approved queue items
 *   - Sends only to active leads with valid email verification
 *   - Uses deterministic FIFO lead ordering
 *   - Applies per-sender warmup-day caps and 60-120 second spacing
 *   - Retries queue failures once, then marks failed
 *   - Marks bounce domains risky for 24 hours
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  lgsOutreachQueue,
  lgsOutreachSettings,
  outreachMessages,
  senderPool,
} from "@/db/schema/directoryEngine";
import {
  hasGmailTokenForSender,
  sendOutreachEmail,
  type SendResult,
} from "./outreachGmailSenderService";
import { LGS_GMAIL_INBOUND_PIPELINES } from "./gmailInboundConfig";
import { normalizeVerificationStatus } from "./simpleEmailVerification";

// ── Shared constant: sender health severity order ─────────────────────────────
// Index 0 = best, index 2 = worst. Exported for use in warmup worker and UI.
export const SENDER_HEALTH_ORDER = ["good", "warning", "risk"] as const;
export type SenderHealthLevel = (typeof SENDER_HEALTH_ORDER)[number];

// ── Machine-readable queue reason codes ───────────────────────────────────────
export type QueueReasonCode =
  | "sender_capacity_ok"
  | "blocked_no_capacity"
  | "blocked_domain_cooldown"
  | "blocked_sender_health"
  | "blocked_stage_replied"
  | "blocked_stage_converted"
  | "blocked_stage_paused"
  | "blocked_stage_archived"
  | "blocked_invalid_email"
  | "deferred_pending_verification"
  | "send_window_closed";

export const QUEUE_REASON_LABELS: Record<QueueReasonCode, string> = {
  sender_capacity_ok: "Capacity Available",
  blocked_no_capacity: "Blocked: No Sender Capacity",
  blocked_domain_cooldown: "Blocked: Domain Cooldown",
  blocked_sender_health: "Blocked: Sender Health",
  blocked_stage_replied: "Blocked: Lead Replied",
  blocked_stage_converted: "Blocked: Lead Converted",
  blocked_stage_paused: "Blocked: Lead Paused",
  blocked_stage_archived: "Blocked: Lead Archived",
  blocked_invalid_email: "Blocked: Invalid Email",
  deferred_pending_verification: "Deferred: Pending Verification",
  send_window_closed: "Blocked: Outside Send Window",
};

// ── Safety constants ──────────────────────────────────────────────────────────
const SEND_WINDOW_START_HOUR = 9;
const SEND_WINDOW_END_HOUR = 17;
const QUEUE_BACKPRESSURE_THRESHOLD = 500;
const BOUNCE_COOLDOWN_HOURS = 6;
const BOUNCE_RATE_THRESHOLD = 0.05;
const BOUNCE_LOOKBACK_COUNT = 20;
const MAX_QUEUE_ATTEMPTS = 2;
const MIN_SEND_DELAY_MS = 60 * 1000;
const MAX_SEND_DELAY_MS = 120 * 1000;
const FOLLOWUP_DELAY_HOURS = 48;
const DOMAIN_RISK_WINDOW_HOURS = 24;
export const OUTREACH_ESTIMATED_DELAY_SECONDS = 90;

// ── Brain settings cache (refreshed each scheduler run) ──────────────────────
type BrainSettings = {
  minSenderHealthLevel: SenderHealthLevel;
  domainCooldownDays: number;
};

export type SendWindowBlock = {
  blocked: true;
  reason: "outside_send_window";
  nextSendWindow: Date;
};

export type OutreachCycleResult = {
  sent: number;
  failed: number;
  blockedReason?: "outside_send_window";
  nextSendWindow?: Date;
};

export type SenderSelectionResult =
  | { id: string; senderEmail: string }
  | SendWindowBlock
  | null;

const DEFAULT_SETTINGS: BrainSettings = {
  minSenderHealthLevel: "risk",
  domainCooldownDays: 1,
};

export async function loadBrainSettings(): Promise<BrainSettings> {
  try {
    const [row] = await db.select().from(lgsOutreachSettings).limit(1);
    if (!row) return DEFAULT_SETTINGS;
    return {
      minSenderHealthLevel: (SENDER_HEALTH_ORDER.includes(row.minSenderHealthLevel as SenderHealthLevel)
        ? row.minSenderHealthLevel
        : "risk") as SenderHealthLevel,
      domainCooldownDays: 1,
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

export function getNextSendWindow(): Date {
  const ptOffset = -8;
  const targetUtcHour = (SEND_WINDOW_START_HOUR - ptOffset + 24) % 24;
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(targetUtcHour, 0, 0, 0);

  if (now >= next) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
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

function computeSenderDailyCap(warmupDay: number | null | undefined, configuredLimit: number | null | undefined): number {
  const day = warmupDay ?? 0;
  const baseCap = day <= 2 ? 10 : day <= 4 ? 20 : 45;
  const configured = configuredLimit ?? baseCap;
  return Math.max(0, Math.min(baseCap, configured));
}

async function isDomainTemporarilyRisky(companyDomain: string, excludeLeadId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - DOMAIN_RISK_WINDOW_HOURS * 60 * 60 * 1000);
  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(contractorLeads)
    .where(
      and(
        sql`${contractorLeads.id} != ${excludeLeadId}`,
        eq(contractorLeads.emailBounced, true),
        sql`${contractorLeads.updatedAt} >= ${cutoff}`,
        sql`(
          (${contractorLeads.website} IS NOT NULL AND lower(regexp_replace(regexp_replace(${contractorLeads.website}, '^https?://(www\\.)?', ''), '/.*$', '')) = ${companyDomain})
          OR
          (${contractorLeads.website} IS NULL AND split_part(lower(${contractorLeads.email}), '@', 2) = ${companyDomain})
        )`
      )
    );
  return Number(row?.cnt ?? 0) > 0;
}

export async function isDomainOnCooldown(
  companyDomain: string,
  _cooldownDaysOrExcludeLeadId: number | string,
  excludeLeadId?: string,
  pipeline: "contractor" | "jobs" = "contractor"
): Promise<boolean> {
  if (!companyDomain) return false;
  const resolvedLeadId =
    typeof _cooldownDaysOrExcludeLeadId === "string"
      ? _cooldownDaysOrExcludeLeadId
      : (excludeLeadId ?? "");
  if (!resolvedLeadId) return false;
  if (pipeline === "jobs") {
    return isDomainTemporarilyRisky(companyDomain, resolvedLeadId);
  }
  return isDomainTemporarilyRisky(companyDomain, resolvedLeadId);
}

// ── Bounce detection ──────────────────────────────────────────────────────────

async function checkBounceRate(senderEmail: string): Promise<{ exceeded: boolean; rate: number }> {
  const [row] = await db
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

  const total = Number(row?.total ?? 0);
  const bounced = Number(row?.bounced ?? 0);
  if (total < BOUNCE_LOOKBACK_COUNT) return { exceeded: false, rate: 0 };
  const rate = bounced / total;
  return { exceeded: rate > BOUNCE_RATE_THRESHOLD, rate };
}

// ── Deterministic sender selection ────────────────────────────────────────────

type EligibleSender = {
  id: string;
  senderEmail: string;
  lastSentAt: Date | null;
  remaining: number;
};

function mergeOutboundMetadata(
  current: unknown,
  metadata: {
    senderAccount: string;
    gmailMessageId: string | null;
    gmailThreadId: string | null;
    rfcMessageId: string;
    sentAt: string;
  },
): Record<string, unknown> {
  const base = current && typeof current === "object" && !Array.isArray(current)
    ? current as Record<string, unknown>
    : {};
  const existingOutbound = base.outbound && typeof base.outbound === "object" && !Array.isArray(base.outbound)
    ? base.outbound as Record<string, unknown>
    : {};

  return {
    ...base,
    outbound: {
      ...existingOutbound,
      senderAccount: metadata.senderAccount,
      gmailMessageId: metadata.gmailMessageId,
      gmailThreadId: metadata.gmailThreadId,
      rfcMessageId: metadata.rfcMessageId,
      sentAt: metadata.sentAt,
    },
  };
}

export async function selectAvailableSender(
  settings: BrainSettings,
  pipeline: "contractor" | "jobs" = "contractor",
): Promise<SenderSelectionResult> {
  if (!isWithinSendWindow()) {
    const nextSendWindow = getNextSendWindow();
    console.log("[OUTREACH BLOCKED] Outside send window. Next:", nextSendWindow.toISOString());
    return {
      blocked: true,
      reason: "outside_send_window",
      nextSendWindow,
    };
  }
  const allowedSenders = new Set(
    (pipeline === "contractor"
      ? LGS_GMAIL_INBOUND_PIPELINES.contractor
      : LGS_GMAIL_INBOUND_PIPELINES.jobs).map((email) => email.trim().toLowerCase()),
  );

  const senders = await db
    .select({
      id: senderPool.id,
      senderEmail: senderPool.senderEmail,
      dailyLimit: senderPool.dailyLimit,
      lastSentAt: senderPool.lastSentAt,
      warmupDay: senderPool.warmupDay,
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

  const eligible: EligibleSender[] = [];
  const now = new Date();
  const minHealthIdx = SENDER_HEALTH_ORDER.indexOf(settings.minSenderHealthLevel);

  for (const s of senders) {
    if (!s.outreachEnabled) continue;
    if (!allowedSenders.has((s.senderEmail ?? "").trim().toLowerCase())) continue;
    if (s.warmupStatus !== "warming" && s.warmupStatus !== "ready") continue;
    if (s.cooldownUntil && new Date(s.cooldownUntil) > now) continue;

    const totalSent = (s.warmupSentToday ?? 0) + (s.outreachSentToday ?? 0);
    const dailyCap = computeSenderDailyCap(s.warmupDay, s.dailyLimit);
    const remaining = dailyCap - totalSent;
    if (remaining <= 0) continue;

    if (minutesSince(s.lastSentAt ?? null) < 1) continue;
    if (!hasGmailTokenForSender(s.senderEmail ?? "")) continue;

    const senderHealthIdx = SENDER_HEALTH_ORDER.indexOf((s.healthScore ?? "risk") as SenderHealthLevel);
    if (senderHealthIdx > minHealthIdx) continue;

    eligible.push({
      id: s.id,
      senderEmail: s.senderEmail ?? "",
      lastSentAt: s.lastSentAt ?? null,
      remaining,
    });
  }

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    const aTime = a.lastSentAt?.getTime() ?? 0;
    const bTime = b.lastSentAt?.getTime() ?? 0;
    if (aTime !== bTime) return aTime - bTime;
    if (a.remaining !== b.remaining) return b.remaining - a.remaining;
    return a.senderEmail.localeCompare(b.senderEmail);
  });

  const selected = eligible[0]!;
  return { id: selected.id, senderEmail: selected.senderEmail };
}

// ── Queue fetch with FIFO ordering ─────────────────────────────────────────────

async function fetchNextQueuedMessage(
  settings: BrainSettings
): Promise<
  | {
      kind: "ready";
      queueId: string;
      messageId: string;
      leadId: string;
      email: string;
      subject: string;
      body: string;
      messageType: string | null;
      generationContext: unknown;
      senderEmail: string;
      senderId: string;
      website: string | null;
      outreachStage: string | null;
      verificationStatus: string | null;
    }
  | {
      kind: "blocked";
      blockedReason: "outside_send_window";
      nextSendWindow: Date;
    }
  | null
> {
  const sender = await selectAvailableSender(settings, "contractor");
  if (!sender) return null;
  if ("blocked" in sender) {
    return {
      kind: "blocked",
      blockedReason: sender.reason,
      nextSendWindow: sender.nextSendWindow,
    };
  }

  const rows = await db
    .select({
      queueId: lgsOutreachQueue.id,
      messageId: outreachMessages.id,
      leadId: lgsOutreachQueue.leadId,
      subject: outreachMessages.subject,
      body: outreachMessages.body,
      messageType: outreachMessages.messageType,
      messageStatus: outreachMessages.status,
      generationContext: outreachMessages.generationContext,
      email: contractorLeads.email,
      website: contractorLeads.website,
      outreachStage: contractorLeads.outreachStage,
      verificationStatus: contractorLeads.verificationStatus,
      status: contractorLeads.status,
      archived: contractorLeads.archived,
      emailBounced: contractorLeads.emailBounced,
      contactAttempts: contractorLeads.contactAttempts,
      createdAt: contractorLeads.createdAt,
    })
    .from(lgsOutreachQueue)
    .innerJoin(outreachMessages, eq(lgsOutreachQueue.outreachMessageId, outreachMessages.id))
    .innerJoin(contractorLeads, eq(lgsOutreachQueue.leadId, contractorLeads.id))
    .where(eq(lgsOutreachQueue.sendStatus, "pending"))
    .orderBy(
      asc(contractorLeads.createdAt),
      asc(lgsOutreachQueue.createdAt)
    )
    .limit(50)
    .for("update", { skipLocked: true });

  for (const row of rows) {
    if (!row.subject || !row.body || !row.email) continue;
    if (row.messageStatus !== "approved" && row.messageStatus !== "queued") continue;

    const blockedStages = ["replied", "converted", "paused", "archived"];
    if (row.outreachStage && blockedStages.includes(row.outreachStage)) continue;
    if (row.archived) continue;
    if (row.status === "archived") continue;
    if (row.emailBounced) continue;

    const verificationStatus = normalizeVerificationStatus(row.verificationStatus);
    if (verificationStatus === "invalid" || verificationStatus === "pending") continue;

    const messageType = row.messageType ?? "intro_standard";
    if (row.contactAttempts > 0 && !messageType.startsWith("followup")) continue;

    const domain = getCompanyDomain(row.website, row.email);
    if (domain) {
      const risky = await isDomainTemporarilyRisky(domain, row.leadId);
      if (risky) continue;
    }

    return {
      kind: "ready",
      queueId: row.queueId,
      messageId: row.messageId,
      leadId: row.leadId,
      email: row.email.trim().toLowerCase(),
      subject: row.subject,
      body: row.body,
      messageType,
      generationContext: row.generationContext,
      senderEmail: sender.senderEmail,
      senderId: sender.id,
      website: row.website,
      outreachStage: row.outreachStage,
      verificationStatus,
    };
  }

  return null;
}

// ── Send helpers ──────────────────────────────────────────────────────────────

async function sendQueuedEmail(params: {
  subject: string;
  body: string;
  contactEmail: string;
  senderAccount: string;
}): Promise<SendResult> {
  return sendOutreachEmail(params);
}

export async function sendWithRetry(params: {
  subject: string;
  body: string;
  contactEmail: string;
  senderAccount: string;
}): Promise<SendResult> {
  return sendQueuedEmail(params);
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
  const delayMs = randomBetween(MIN_SEND_DELAY_MS, MAX_SEND_DELAY_MS);
  await new Promise((r) => setTimeout(r, delayMs));
}

async function markDomainRisk(companyDomain: string | null, bounceReason: string | null, excludeLeadId: string): Promise<void> {
  if (!companyDomain) return;

  await db
    .update(contractorLeads)
    .set({
      domainReputation: "risky",
      bounceReason: bounceReason ?? "domain_risky",
      updatedAt: new Date(),
    })
    .where(
      and(
        sql`${contractorLeads.id} != ${excludeLeadId}`,
        sql`(
          (${contractorLeads.website} IS NOT NULL AND lower(regexp_replace(regexp_replace(${contractorLeads.website}, '^https?://(www\\.)?', ''), '/.*$', '')) = ${companyDomain})
          OR
          (${contractorLeads.website} IS NULL AND split_part(lower(${contractorLeads.email}), '@', 2) = ${companyDomain})
        )`
      )
    );
}

// ── Main scheduler entry point ────────────────────────────────────────────────

export async function runLgsOutreachScheduler(): Promise<OutreachCycleResult> {
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

  // Process the lightweight queue only.
  const queued = await fetchNextQueuedMessage(settings);
  if (!queued) return { sent: 0, failed: 0 };
  if (queued.kind === "blocked") {
    return {
      sent: 0,
      failed: 0,
      blockedReason: queued.blockedReason,
      nextSendWindow: queued.nextSendWindow,
    };
  }

  await addRandomDelay();

  const result = await sendQueuedEmail({
    subject: queued.subject,
    body: queued.body,
    contactEmail: queued.email,
    senderAccount: queued.senderEmail,
  });

  const now = new Date();

  if (result.ok) {
    const nextFollowupAt =
      queued.messageType === "followup_1"
        ? null
        : new Date(now.getTime() + FOLLOWUP_DELAY_HOURS * 60 * 60 * 1000);

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
      .set({
        status: "sent",
        generationContext: mergeOutboundMetadata(queued.generationContext, {
          senderAccount: queued.senderEmail,
          gmailMessageId: result.gmailMessageId,
          gmailThreadId: result.gmailThreadId,
          rfcMessageId: result.rfcMessageId,
          sentAt: now.toISOString(),
        }),
      })
      .where(eq(outreachMessages.id, queued.messageId));

    await db
      .update(contractorLeads)
      .set({
        status: "active",
        contactAttempts: sql`${contractorLeads.contactAttempts} + 1`,
        emailDate: now,
        outreachStage: "sent",
        lastContactedAt: now,
        nextFollowupAt,
        updatedAt: now,
      })
      .where(eq(contractorLeads.id, queued.leadId));

    await incrementOutreachCounter(queued.senderId);
    return { sent: 1, failed: 0 };
  }

  if (result.bounce) {
    await db
      .update(contractorLeads)
      .set({
        emailBounced: true,
        bounceReason: result.message,
        verificationStatus: "invalid",
        domainReputation: "risky",
        updatedAt: now,
      })
      .where(eq(contractorLeads.id, queued.leadId));

    await markDomainRisk(getCompanyDomain(queued.website, queued.email), result.message, queued.leadId);

    const { exceeded, rate } = await checkBounceRate(queued.senderEmail);
    if (exceeded) {
      await triggerBounceCooldown(queued.senderId, queued.senderEmail, rate);
    }
  }

  const [queueRow] = await db
    .select({ attempts: lgsOutreachQueue.attempts })
    .from(lgsOutreachQueue)
    .where(eq(lgsOutreachQueue.id, queued.queueId))
    .limit(1);
  const attempts = (queueRow?.attempts ?? 0) + 1;

  await db
    .update(lgsOutreachQueue)
    .set({
      attempts,
      sendStatus: result.bounce || attempts >= MAX_QUEUE_ATTEMPTS ? "failed" : "pending",
      errorMessage: result.message,
      senderAccount: queued.senderEmail,
    })
    .where(eq(lgsOutreachQueue.id, queued.queueId));

  await db
    .update(outreachMessages)
    .set({
      generationContext: mergeOutboundMetadata(queued.generationContext, {
        senderAccount: queued.senderEmail,
        gmailMessageId: null,
        gmailThreadId: null,
        rfcMessageId: "send_failed",
        sentAt: now.toISOString(),
      }),
    })
    .where(eq(outreachMessages.id, queued.messageId));

  return { sent: 0, failed: 1 };
}
