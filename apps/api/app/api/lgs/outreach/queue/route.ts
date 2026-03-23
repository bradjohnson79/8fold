/**
 * LGS Outreach: List LGS queue items with brain intelligence fields.
 *
 * Query params:
 *   status      — filter by send_status (pending | sent | failed)
 *   limit       — default 100, max 200
 *   offset      — default 0
 */
import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  lgsOutreachQueue,
  lgsOutreachSettings,
  outreachMessages,
  senderPool,
} from "@/db/schema/directoryEngine";
import { SENDER_HEALTH_ORDER } from "@/src/services/lgs/lgsOutreachSchedulerService";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status");
    const limit = Math.min(parseInt(sp.get("limit") ?? "100", 10) || 100, 200);
    const offset = parseInt(sp.get("offset") ?? "0", 10) || 0;

    // ── Queue summary counts ─────────────────────────────────────────────────
    const [summary] = await db
      .select({
        pending: sql<number>`COUNT(*) FILTER (WHERE ${lgsOutreachQueue.sendStatus} = 'pending')::int`,
        sent: sql<number>`COUNT(*) FILTER (WHERE ${lgsOutreachQueue.sendStatus} = 'sent')::int`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${lgsOutreachQueue.sendStatus} = 'failed')::int`,
      })
      .from(lgsOutreachQueue);

    // ── Sender capacity summary ──────────────────────────────────────────────
    const [capacityRow] = await db
      .select({
        totalLimit: sql<number>`COALESCE(SUM(${senderPool.dailyLimit}), 0)::int`,
        totalSent: sql<number>`COALESCE(SUM(${senderPool.outreachSentToday}), 0)::int`,
      })
      .from(senderPool)
      .where(and(eq(senderPool.status, "active"), eq(senderPool.outreachEnabled, true)));

    const sysCapacityUsed = Number(capacityRow?.totalSent ?? 0);
    const sysCapacityTotal = Number(capacityRow?.totalLimit ?? 0);
    const sysCapacityRemaining = Math.max(0, sysCapacityTotal - sysCapacityUsed);

    // ── Load brain settings for gate context ────────────────────────────────
    const [settings] = await db.select().from(lgsOutreachSettings).limit(1);
    const domainCooldownDays = settings?.domainCooldownDays ?? 7;
    const minHealthLevel = settings?.minSenderHealthLevel ?? "risk";
    const minHealthIdx = SENDER_HEALTH_ORDER.indexOf(minHealthLevel as typeof SENDER_HEALTH_ORDER[number]);

    // ── Main queue items ─────────────────────────────────────────────────────
    const whereClause = status ? eq(lgsOutreachQueue.sendStatus, status) : undefined;

    const rows = await db
      .select({
        id: lgsOutreachQueue.id,
        outreachMessageId: lgsOutreachQueue.outreachMessageId,
        leadId: lgsOutreachQueue.leadId,
        priority: lgsOutreachQueue.priority,
        senderAccount: lgsOutreachQueue.senderAccount,
        sendStatus: lgsOutreachQueue.sendStatus,
        sentAt: lgsOutreachQueue.sentAt,
        attempts: lgsOutreachQueue.attempts,
        errorMessage: lgsOutreachQueue.errorMessage,
        createdAt: lgsOutreachQueue.createdAt,
        subject: outreachMessages.subject,
        messageType: outreachMessages.messageType,
        leadEmail: contractorLeads.email,
        businessName: contractorLeads.businessName,
        trade: contractorLeads.trade,
        city: contractorLeads.city,
        leadScore: contractorLeads.leadScore,
        priorityScore: contractorLeads.priorityScore,
        leadPriority: contractorLeads.leadPriority,
        emailVerificationStatus: contractorLeads.emailVerificationStatus,
        archived: contractorLeads.archived,
        outreachStage: contractorLeads.outreachStage,
        followupCount: contractorLeads.followupCount,
        website: contractorLeads.website,
      })
      .from(lgsOutreachQueue)
      .innerJoin(outreachMessages, eq(lgsOutreachQueue.outreachMessageId, outreachMessages.id))
      .innerJoin(contractorLeads, eq(lgsOutreachQueue.leadId, contractorLeads.id))
      .where(whereClause)
      .orderBy(
        asc(
          sql`CASE
            WHEN lower(coalesce(${contractorLeads.emailVerificationStatus}, 'pending')) IN ('valid', 'verified') THEN 0
            WHEN lower(coalesce(${contractorLeads.emailVerificationStatus}, 'pending')) = 'invalid' THEN 2
            ELSE 1
          END`
        ),
        asc(contractorLeads.createdAt),
        asc(lgsOutreachQueue.createdAt)
      )
      .limit(limit)
      .offset(offset);

    // ── Build reason codes for each item ─────────────────────────────────────
    const blockedStages = new Set(["replied", "converted", "paused", "archived"]);

    const data = rows.map((row) => {
      const reasonCodes: string[] = [];
      let ready = true;

      // Stage block
      if (row.outreachStage && blockedStages.has(row.outreachStage)) {
        reasonCodes.push(`blocked_stage_${row.outreachStage}`);
        ready = false;
      }

      if (row.archived) {
        reasonCodes.push("blocked_archived");
        ready = false;
      }

      const verificationStatus = String(row.emailVerificationStatus ?? "pending").trim().toLowerCase();
      if (verificationStatus === "invalid") {
        reasonCodes.push("blocked_invalid_email");
        ready = false;
      } else if (!(verificationStatus === "valid" || verificationStatus === "verified")) {
        reasonCodes.push("deferred_pending_verification");
        ready = false;
      }

      // Capacity indicator
      if (sysCapacityRemaining > 0 && ready) {
        reasonCodes.push("sender_capacity_ok");
      } else if (sysCapacityRemaining === 0) {
        reasonCodes.push("blocked_no_capacity");
        ready = false;
      }

      return {
        id: row.id,
        lead_id: row.leadId,
        outreach_message_id: row.outreachMessageId,
        sender_account: row.senderAccount,
        send_status: row.sendStatus,
        sent_at: row.sentAt?.toISOString() ?? null,
        attempts: row.attempts ?? 0,
        error_message: row.errorMessage,
        created_at: row.createdAt?.toISOString() ?? null,
        subject: row.subject,
        message_type: row.messageType ?? "intro_standard",
        lead_email: row.leadEmail,
        business_name: row.businessName,
        trade: row.trade,
        city: row.city,
        lead_score: row.leadScore ?? 0,
        priority_score: row.priorityScore ?? 0,
        lead_priority: row.leadPriority ?? "medium",
        email_verification_status: row.emailVerificationStatus ?? "pending",
        outreach_stage: row.outreachStage ?? "not_contacted",
        followup_count: row.followupCount ?? 0,
        reason_codes: reasonCodes,
        is_ready: ready && row.sendStatus === "pending",
      };
    });

    return NextResponse.json({
      ok: true,
      summary: {
        pending: Number(summary?.pending ?? 0),
        sent: Number(summary?.sent ?? 0),
        failed: Number(summary?.failed ?? 0),
        capacity_used: sysCapacityUsed,
        capacity_total: sysCapacityTotal,
        capacity_remaining: sysCapacityRemaining,
        min_score_threshold: null,
      },
      data,
    });
  } catch (err) {
    console.error("LGS queue list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
