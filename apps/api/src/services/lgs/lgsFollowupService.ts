/**
 * LGS Follow-up Engine.
 *
 * Lifecycle model (kept clean):
 *   - outreach_stage = 'sent'   throughout all follow-up cycles (does NOT change to a "due" stage)
 *   - next_followup_at          = scheduling signal — the engine acts when this <= NOW()
 *   - followup_count            = 0 → 1 → 2 → triggers pause after max reached
 *
 * Safety constraints:
 *   - Never generates a follow-up for replied/converted/paused/archived leads
 *   - Never generates a follow-up when last_message_type_sent is already followup_2
 *   - Uses determineMessageType() to select the correct type
 *   - Respects brain settings for delays and approval requirements
 */
import { and, eq, lte, lt, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  lgsOutreachQueue,
  lgsOutreachSettings,
  outreachMessages,
} from "@/db/schema/directoryEngine";
import {
  generateOutreachEmail,
  determineMessageType,
  computeMessageVersionHash,
} from "./outreachEmailGenerationService";

// ── Types ─────────────────────────────────────────────────────────────────────

type FollowupResult = {
  processed: number;
  generated: number;
  skipped: number;
  paused: number;
  errors: number;
};

// ── Settings loader ───────────────────────────────────────────────────────────

type FollowupSettings = {
  followup1DelayDays: number;
  followup2DelayDays: number;
  maxFollowupsPerLead: number;
  autoGenerateFollowups: boolean;
  requireFollowupApproval: boolean;
};

const FOLLOWUP_DEFAULTS: FollowupSettings = {
  followup1DelayDays: 4,
  followup2DelayDays: 6,
  maxFollowupsPerLead: 2,
  autoGenerateFollowups: true,
  requireFollowupApproval: true,
};

async function loadFollowupSettings(): Promise<FollowupSettings> {
  try {
    const [row] = await db.select().from(lgsOutreachSettings).limit(1);
    if (!row) return FOLLOWUP_DEFAULTS;
    return {
      followup1DelayDays: row.followup1DelayDays,
      followup2DelayDays: row.followup2DelayDays,
      maxFollowupsPerLead: row.maxFollowupsPerLead,
      autoGenerateFollowups: row.autoGenerateFollowups,
      requireFollowupApproval: row.requireFollowupApproval,
    };
  } catch {
    return FOLLOWUP_DEFAULTS;
  }
}

// ── Main engine ───────────────────────────────────────────────────────────────

/**
 * Process all leads that are due for a follow-up.
 * Safe to call from any cron cycle — will no-op if no leads are due.
 */
export async function runFollowupEngine(): Promise<FollowupResult> {
  const result: FollowupResult = { processed: 0, generated: 0, skipped: 0, paused: 0, errors: 0 };

  const settings = await loadFollowupSettings();

  if (!settings.autoGenerateFollowups) {
    return result;
  }

  const now = new Date();

  // Query leads due for follow-up
  // Conditions:
  //   - outreach_stage = 'sent' (only active lifecycle stage that triggers follow-up)
  //   - next_followup_at <= NOW()
  //   - followup_count < max_followups_per_lead
  //   - Not in a terminal stage (guard against edge cases)
  const dueleads = await db
    .select({
      id: contractorLeads.id,
      email: contractorLeads.email,
      businessName: contractorLeads.businessName,
      trade: contractorLeads.trade,
      city: contractorLeads.city,
      state: contractorLeads.state,
      leadName: contractorLeads.leadName,
      leadPriority: contractorLeads.leadPriority,
      followupCount: contractorLeads.followupCount,
      lastMessageTypeSent: contractorLeads.lastMessageTypeSent,
      outreachStage: contractorLeads.outreachStage,
      nextFollowupAt: contractorLeads.nextFollowupAt,
    })
    .from(contractorLeads)
    .where(
      and(
        eq(contractorLeads.outreachStage, "sent"),
        lte(contractorLeads.nextFollowupAt, now),
        lt(contractorLeads.followupCount, settings.maxFollowupsPerLead),
        sql`${contractorLeads.nextFollowupAt} IS NOT NULL`
      )
    )
    .limit(50);

  if (dueleads.length === 0) return result;

  // Pre-fetch all existing hashes
  const existingHashes = new Set(
    (await db.select({ hash: outreachMessages.messageHash }).from(outreachMessages))
      .map((r) => r.hash ?? "")
      .filter(Boolean)
  );

  for (const lead of dueleads) {
    result.processed++;

    try {
      // Safety: skip any terminal stages (belt-and-suspenders on top of the WHERE clause)
      const blockedStages = ["replied", "converted", "paused", "archived"];
      if (lead.outreachStage && blockedStages.includes(lead.outreachStage)) {
        result.skipped++;
        continue;
      }

      // Guard: skip if already sent followup_2 (don't double-generate)
      if (lead.lastMessageTypeSent === "followup_2") {
        // Pause this lead — it's at max
        await db
          .update(contractorLeads)
          .set({ outreachStage: "paused", updatedAt: now })
          .where(eq(contractorLeads.id, lead.id));
        result.paused++;
        continue;
      }

      const messageType = determineMessageType({
        businessName: lead.businessName ?? "",
        trade: lead.trade ?? "",
        city: lead.city ?? "",
        state: lead.state ?? undefined,
        leadPriority: lead.leadPriority ?? "medium",
        followupCount: lead.followupCount ?? 0,
        lastMessageTypeSent: lead.lastMessageTypeSent,
      });

      const messageVersionHash = computeMessageVersionHash(messageType, {
        trade: lead.trade ?? "",
        city: lead.city ?? "",
        leadPriority: lead.leadPriority ?? "medium",
      });

      const generated = await generateOutreachEmail(
        {
          businessName: lead.businessName ?? "",
          trade: lead.trade ?? "",
          city: lead.city ?? "",
          state: lead.state ?? "",
          contactName: lead.leadName ?? undefined,
          leadPriority: lead.leadPriority ?? "medium",
          followupCount: lead.followupCount ?? 0,
          lastMessageTypeSent: lead.lastMessageTypeSent,
        },
        existingHashes
      );

      existingHashes.add(generated.hash);

      const generationContext = {
        business_name: lead.businessName ?? "",
        trade: lead.trade ?? "",
        city: lead.city ?? "",
        message_type: messageType,
        followup_count: (lead.followupCount ?? 0) + 1,
      };

      // Insert the message
      const [inserted] = await db
        .insert(outreachMessages)
        .values({
          leadId: lead.id,
          subject: generated.subject,
          body: generated.body,
          messageHash: generated.hash,
          generationContext,
          generatedBy: "gpt5-nano",
          status: settings.requireFollowupApproval ? "pending_review" : "approved",
          messageType,
          messageVersionHash,
        })
        .returning();

      // If auto-approved, add to queue
      if (!settings.requireFollowupApproval) {
        const priorityRank =
          lead.leadPriority === "high" ? 1 : lead.leadPriority === "medium" ? 2 : 3;
        await db.insert(lgsOutreachQueue).values({
          outreachMessageId: inserted.id,
          leadId: lead.id,
          priority: priorityRank,
          sendStatus: "pending",
        });
      }

      // Calculate next follow-up date (for potential future follow-up after this one)
      const newFollowupCount = (lead.followupCount ?? 0) + 1;
      const nextFollowupAt =
        newFollowupCount < settings.maxFollowupsPerLead
          ? new Date(now.getTime() + settings.followup2DelayDays * 24 * 60 * 60 * 1000)
          : null;

      // Update lead state
      await db
        .update(contractorLeads)
        .set({
          followupCount: newFollowupCount,
          lastMessageTypeSent: messageType,
          nextFollowupAt,
          // Pause if this was the last follow-up
          ...(nextFollowupAt === null ? { outreachStage: "paused" } : {}),
          updatedAt: now,
        })
        .where(eq(contractorLeads.id, lead.id));

      if (nextFollowupAt === null) {
        result.paused++;
      }

      result.generated++;
    } catch (err) {
      console.error(`[LGS Follow-up] Error processing lead ${lead.id}:`, err);
      result.errors++;
    }
  }

  if (result.generated > 0 || result.paused > 0) {
    console.log(
      `[LGS Follow-up] processed=${result.processed} generated=${result.generated} paused=${result.paused} errors=${result.errors}`
    );
  }

  return result;
}
