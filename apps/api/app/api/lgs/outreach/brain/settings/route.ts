/**
 * LGS Outreach Brain Settings — GET + PATCH.
 * Reads and updates the single-row lgs_outreach_settings config table.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { lgsOutreachSettings } from "@/db/schema/directoryEngine";
import { SENDER_HEALTH_ORDER, type SenderHealthLevel } from "@/src/services/lgs/lgsOutreachSchedulerService";

export async function GET() {
  try {
    const [row] = await db.select().from(lgsOutreachSettings).limit(1);
    if (!row) {
      return NextResponse.json({
        ok: true,
        data: {
          min_lead_score_to_queue: 0,
          domain_cooldown_days: 7,
          followup1_delay_days: 4,
          followup2_delay_days: 6,
          max_followups_per_lead: 2,
          auto_generate_followups: true,
          require_followup_approval: true,
          max_sends_per_company_30d: 3,
          min_sender_health_level: "risk",
        },
      });
    }
    return NextResponse.json({
      ok: true,
      data: {
        min_lead_score_to_queue: row.minLeadScoreToQueue,
        domain_cooldown_days: row.domainCooldownDays,
        followup1_delay_days: row.followup1DelayDays,
        followup2_delay_days: row.followup2DelayDays,
        max_followups_per_lead: row.maxFollowupsPerLead,
        auto_generate_followups: row.autoGenerateFollowups,
        require_followup_approval: row.requireFollowupApproval,
        max_sends_per_company_30d: row.maxSendsPerCompany30d,
        min_sender_health_level: row.minSenderHealthLevel,
      },
    });
  } catch (err) {
    console.error("LGS brain settings GET error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const updates: Partial<typeof lgsOutreachSettings.$inferInsert> = {};

    if (typeof body.min_lead_score_to_queue === "number") {
      updates.minLeadScoreToQueue = Math.max(0, Math.min(100, body.min_lead_score_to_queue));
    }
    if (typeof body.domain_cooldown_days === "number") {
      updates.domainCooldownDays = Math.max(0, Math.min(90, body.domain_cooldown_days));
    }
    if (typeof body.followup1_delay_days === "number") {
      updates.followup1DelayDays = Math.max(1, Math.min(30, body.followup1_delay_days));
    }
    if (typeof body.followup2_delay_days === "number") {
      updates.followup2DelayDays = Math.max(1, Math.min(30, body.followup2_delay_days));
    }
    if (typeof body.max_followups_per_lead === "number") {
      updates.maxFollowupsPerLead = Math.max(0, Math.min(5, body.max_followups_per_lead));
    }
    if (typeof body.auto_generate_followups === "boolean") {
      updates.autoGenerateFollowups = body.auto_generate_followups;
    }
    if (typeof body.require_followup_approval === "boolean") {
      updates.requireFollowupApproval = body.require_followup_approval;
    }
    if (typeof body.max_sends_per_company_30d === "number") {
      updates.maxSendsPerCompany30d = Math.max(1, Math.min(20, body.max_sends_per_company_30d));
    }
    if (
      typeof body.min_sender_health_level === "string" &&
      SENDER_HEALTH_ORDER.includes(body.min_sender_health_level as SenderHealthLevel)
    ) {
      updates.minSenderHealthLevel = body.min_sender_health_level as string;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "no_valid_fields" }, { status: 400 });
    }

    updates.updatedAt = new Date();

    // Upsert: ensure row 1 exists, then update
    await db
      .insert(lgsOutreachSettings)
      .values({ id: 1, ...updates })
      .onConflictDoUpdate({ target: lgsOutreachSettings.id, set: updates });

    const [saved] = await db.select().from(lgsOutreachSettings).limit(1);

    return NextResponse.json({
      ok: true,
      data: {
        min_lead_score_to_queue: saved?.minLeadScoreToQueue,
        domain_cooldown_days: saved?.domainCooldownDays,
        followup1_delay_days: saved?.followup1DelayDays,
        followup2_delay_days: saved?.followup2DelayDays,
        max_followups_per_lead: saved?.maxFollowupsPerLead,
        auto_generate_followups: saved?.autoGenerateFollowups,
        require_followup_approval: saved?.requireFollowupApproval,
        max_sends_per_company_30d: saved?.maxSendsPerCompany30d,
        min_sender_health_level: saved?.minSenderHealthLevel,
      },
    });
  } catch (err) {
    console.error("LGS brain settings PATCH error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
