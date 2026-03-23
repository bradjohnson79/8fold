/**
 * LGS Lead Scoring Engine — single source of truth for all scoring logic.
 *
 * Rules:
 *  - scoreLead() is a pure function — no DB access
 *  - scoreAndSaveLead() writes score + priority but NEVER overwrites lead_priority
 *    when priority_source = 'manual'
 *  - rescoreDirtyLeads() is the default maintenance path (only score_dirty = true)
 *  - rescoreAllLeads() is admin-only and should not run in hot paths
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";

// ── Types ────────────────────────────────────────────────────────────────────

export type LeadPriority = "high" | "medium" | "low";

export type ScoreInput = {
  verificationScore: number | null;
  businessName: string | null;
  trade: string | null;
  city: string | null;
  state: string | null;
  email: string;
  leadSource: string | null;
  emailBounced: boolean | null;
  archived: boolean;
};

export type ScoreResult = {
  score: number;
  priority: LeadPriority;
};

// ── Scoring constants ────────────────────────────────────────────────────────

const HIGH_EMAIL_PREFIXES = ["sales", "service", "owner", "info@owner"];
const MEDIUM_EMAIL_PREFIXES = ["info", "contact", "hello", "team"];
const LOW_EMAIL_PREFIXES = ["admin", "support", "billing", "office"];

// Source quality weights
const SOURCE_SCORES: Record<string, number> = {
  google_maps: 10,
  lead_finder: 8,
  google_search: 7,
  yelp: 6,
  linkedin_discovery: 8,
  directory: 4,
  manual: 4,
};

// ── Pure scoring function ────────────────────────────────────────────────────

/**
 * Pure function — computes score and priority from lead fields.
 * No DB access. Safe to call anywhere.
 */
export function scoreLead(lead: ScoreInput): ScoreResult {
  let score = 0;

  // Verification score
  const verif = lead.verificationScore ?? 0;
  if (verif >= 95) score += 25;
  else if (verif >= 85) score += 10;
  else if (verif < 85) score -= 20;

  // Business name
  if (lead.businessName && lead.businessName.trim().length > 2) {
    const clean = /^[A-Za-z0-9\s\-&.,]+$/.test(lead.businessName.trim());
    score += clean ? 10 : -5;
  } else {
    score -= 10;
  }

  // Trade
  if (lead.trade && lead.trade.trim().length > 0) score += 10;

  // City / state
  if (lead.city && lead.city.trim().length > 0) score += 8;
  else score -= 5;
  if (lead.state && lead.state.trim().length > 0) score += 5;

  // Email prefix quality
  const emailPrefix = (lead.email.split("@")[0] ?? "").toLowerCase();
  if (HIGH_EMAIL_PREFIXES.some((p) => emailPrefix.startsWith(p))) {
    score += 10;
  } else if (MEDIUM_EMAIL_PREFIXES.some((p) => emailPrefix.startsWith(p))) {
    score += 6;
  } else if (LOW_EMAIL_PREFIXES.some((p) => emailPrefix.startsWith(p))) {
    score += 2;
  }
  // Personal first name patterns (short word, no generic keywords)
  const isPersonalName =
    emailPrefix.length >= 3 &&
    emailPrefix.length <= 15 &&
    /^[a-z]+$/.test(emailPrefix) &&
    ![...HIGH_EMAIL_PREFIXES, ...MEDIUM_EMAIL_PREFIXES, ...LOW_EMAIL_PREFIXES].some(
      (p) => emailPrefix === p
    );
  if (isPersonalName) score += 8;

  // Source quality
  const source = (lead.leadSource ?? "").toLowerCase();
  const sourceScore = SOURCE_SCORES[source] ?? 2;
  score += sourceScore;

  // Negative signals
  if (lead.emailBounced) score -= 30;
  if (lead.archived) score -= 25;

  // Clamp to sensible range
  score = Math.max(-50, Math.min(100, score));

  const priority: LeadPriority =
    score >= 80 ? "high" : score >= 55 ? "medium" : "low";

  return { score, priority };
}

// ── Priority bucket helper ───────────────────────────────────────────────────

export function scoreToPriority(score: number): LeadPriority {
  return score >= 80 ? "high" : score >= 55 ? "medium" : "low";
}

// ── DB write helpers ─────────────────────────────────────────────────────────

/**
 * Score a single lead by ID and persist results.
 * NEVER overwrites lead_priority when priority_source = 'manual'.
 */
export async function scoreAndSaveLead(leadId: string): Promise<ScoreResult | null> {
  const rows = await db
    .select({
      id: contractorLeads.id,
      verificationScore: contractorLeads.verificationScore,
      businessName: contractorLeads.businessName,
      trade: contractorLeads.trade,
      city: contractorLeads.city,
      state: contractorLeads.state,
      email: contractorLeads.email,
      leadSource: contractorLeads.leadSource,
      emailBounced: contractorLeads.emailBounced,
      archived: contractorLeads.archived,
      prioritySource: contractorLeads.prioritySource,
    })
    .from(contractorLeads)
    .where(eq(contractorLeads.id, leadId))
    .limit(1);

  if (!rows[0]) return null;
  const lead = rows[0];
  const result = scoreLead(lead as ScoreInput);

  const isManual = lead.prioritySource === "manual";

  await db
    .update(contractorLeads)
    .set({
      leadScore: result.score,
      // Only update computed priority if operator hasn't manually set it
      ...(isManual ? {} : { leadPriority: result.priority }),
      scoreDirty: false,
      updatedAt: new Date(),
    })
    .where(eq(contractorLeads.id, leadId));

  return result;
}

/**
 * Default maintenance path — only re-scores leads with score_dirty = true.
 * Safe to run in the cron worker every cycle.
 */
export async function rescoreDirtyLeads(limit = 500): Promise<number> {
  const rows = await db
    .select({
      id: contractorLeads.id,
      verificationScore: contractorLeads.verificationScore,
      businessName: contractorLeads.businessName,
      trade: contractorLeads.trade,
      city: contractorLeads.city,
      state: contractorLeads.state,
      email: contractorLeads.email,
      leadSource: contractorLeads.leadSource,
      emailBounced: contractorLeads.emailBounced,
      archived: contractorLeads.archived,
      prioritySource: contractorLeads.prioritySource,
    })
    .from(contractorLeads)
    .where(eq(contractorLeads.scoreDirty, true))
    .limit(limit);

  if (rows.length === 0) return 0;

  for (const lead of rows) {
    const result = scoreLead(lead as ScoreInput);
    const isManual = lead.prioritySource === "manual";
    await db
      .update(contractorLeads)
      .set({
        leadScore: result.score,
        ...(isManual ? {} : { leadPriority: result.priority }),
        scoreDirty: false,
        updatedAt: new Date(),
      })
      .where(eq(contractorLeads.id, lead.id));
  }

  return rows.length;
}

/**
 * Admin-only brute-force rescore. Same priority-source guard applies.
 * Do NOT call from hot paths or cron — use rescoreDirtyLeads instead.
 */
export async function rescoreAllLeads(): Promise<number> {
  const rows = await db
    .select({
      id: contractorLeads.id,
      verificationScore: contractorLeads.verificationScore,
      businessName: contractorLeads.businessName,
      trade: contractorLeads.trade,
      city: contractorLeads.city,
      state: contractorLeads.state,
      email: contractorLeads.email,
      leadSource: contractorLeads.leadSource,
      emailBounced: contractorLeads.emailBounced,
      archived: contractorLeads.archived,
      prioritySource: contractorLeads.prioritySource,
    })
    .from(contractorLeads);

  if (rows.length === 0) return 0;

  for (const lead of rows) {
    const result = scoreLead(lead as ScoreInput);
    const isManual = lead.prioritySource === "manual";
    await db
      .update(contractorLeads)
      .set({
        leadScore: result.score,
        ...(isManual ? {} : { leadPriority: result.priority }),
        scoreDirty: false,
        updatedAt: new Date(),
      })
      .where(eq(contractorLeads.id, lead.id));
  }

  return rows.length;
}

/**
 * Mark a lead as needing a rescore.
 * Call this whenever a scoring-relevant field changes (verification_score,
 * business_name, trade, city, state, archived, email_bounced).
 */
export async function markLeadDirty(leadId: string): Promise<void> {
  await db
    .update(contractorLeads)
    .set({ scoreDirty: true, updatedAt: new Date() })
    .where(eq(contractorLeads.id, leadId));
}
