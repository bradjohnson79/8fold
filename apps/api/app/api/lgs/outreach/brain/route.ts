/**
 * LGS Outreach Brain: Dashboard aggregates endpoint.
 *
 * Returns:
 *   - Lead counts by priority and stage
 *   - Sender health panel
 *   - Follow-up tracker (due today, tomorrow, overdue)
 *   - Sent/reply/conversion metrics
 *   - Top 10 leads next to send (with reason context)
 */
import { NextResponse } from "next/server";
import { and, eq, lte, lt, gte, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  lgsOutreachQueue,
  lgsOutreachSettings,
  outreachMessages,
  senderPool,
} from "@/db/schema/directoryEngine";
import { QUEUE_REASON_LABELS, type QueueReasonCode } from "@/src/services/lgs/lgsOutreachSchedulerService";

export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const dayAfterTomorrow = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Load brain settings for context
    const [settingsRow] = await db.select().from(lgsOutreachSettings).limit(1);

    // ── Lead distribution by priority ───────────────────────────────────────
    const priorityCounts = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE lead_priority = 'high' AND archived = false)  AS high,
        COUNT(*) FILTER (WHERE lead_priority = 'medium' AND archived = false) AS medium,
        COUNT(*) FILTER (WHERE lead_priority = 'low' AND archived = false)   AS low,
        COUNT(*) FILTER (WHERE archived = false)                              AS total_active
      FROM directory_engine.contractor_leads
    `);
    const pc = (priorityCounts.rows?.[0] ?? {}) as Record<string, string>;

    // ── Lead counts by stage ─────────────────────────────────────────────────
    const stageCounts = await db.execute(sql`
      SELECT outreach_stage, COUNT(*)::int AS cnt
      FROM directory_engine.contractor_leads
      WHERE archived = false
      GROUP BY outreach_stage
    `);
    const stageMap: Record<string, number> = {};
    for (const row of (stageCounts.rows ?? []) as Array<{ outreach_stage: string; cnt: string }>) {
      stageMap[row.outreach_stage ?? "not_contacted"] = Number(row.cnt ?? 0);
    }

    // ── Sender health panel ──────────────────────────────────────────────────
    const senders = await db
      .select({
        id: senderPool.id,
        senderEmail: senderPool.senderEmail,
        healthScore: senderPool.healthScore,
        outreachSentToday: senderPool.outreachSentToday,
        warmupSentToday: senderPool.warmupSentToday,
        dailyLimit: senderPool.dailyLimit,
        cooldownUntil: senderPool.cooldownUntil,
        warmupStatus: senderPool.warmupStatus,
        outreachEnabled: senderPool.outreachEnabled,
        warmupTotalReplies: senderPool.warmupTotalReplies,
        warmupTotalSent: senderPool.warmupTotalSent,
      })
      .from(senderPool)
      .where(eq(senderPool.status, "active"));

    const senderPanel = senders.map((s) => {
      const sentToday = (s.outreachSentToday ?? 0) + (s.warmupSentToday ?? 0);
      const remaining = Math.max(0, (s.dailyLimit ?? 0) - sentToday);
      const replyRate =
        (s.warmupTotalSent ?? 0) > 0
          ? ((s.warmupTotalReplies ?? 0) / (s.warmupTotalSent ?? 1))
          : 0;
      const isCoolingDown = s.cooldownUntil && new Date(s.cooldownUntil) > now;
      return {
        email: s.senderEmail,
        health_score: s.healthScore ?? "unknown",
        sent_today: sentToday,
        daily_limit: s.dailyLimit ?? 0,
        remaining,
        capacity_pct: s.dailyLimit ? Math.round((sentToday / s.dailyLimit) * 100) : 0,
        reply_rate: Math.round(replyRate * 100),
        warmup_status: s.warmupStatus,
        outreach_enabled: s.outreachEnabled,
        is_cooling_down: !!isCoolingDown,
        cooldown_until: s.cooldownUntil?.toISOString() ?? null,
      };
    });

    // ── Follow-up tracker ────────────────────────────────────────────────────
    const followupCounts = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (
          WHERE outreach_stage = 'sent'
            AND next_followup_at >= ${todayStart}
            AND next_followup_at < ${tomorrowStart}
        )::int AS due_today,
        COUNT(*) FILTER (
          WHERE outreach_stage = 'sent'
            AND next_followup_at >= ${tomorrowStart}
            AND next_followup_at < ${dayAfterTomorrow}
        )::int AS due_tomorrow,
        COUNT(*) FILTER (
          WHERE outreach_stage = 'sent'
            AND next_followup_at < ${todayStart}
        )::int AS overdue
      FROM directory_engine.contractor_leads
    `);
    const fc = (followupCounts.rows?.[0] ?? {}) as Record<string, string>;

    // ── Performance metrics ──────────────────────────────────────────────────
    const [metrics] = await db
      .select({
        sentToday: sql<number>`COUNT(*) FILTER (WHERE ${lgsOutreachQueue.sentAt} >= ${todayStart} AND ${lgsOutreachQueue.sendStatus} = 'sent')::int`,
        pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${lgsOutreachQueue.sendStatus} = 'pending')::int`,
      })
      .from(lgsOutreachQueue);

    const repliesWeek = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(contractorLeads)
      .where(
        and(
          eq(contractorLeads.responseReceived, true),
          gte(contractorLeads.lastRepliedAt, sevenDaysAgo)
        )
      );

    const conversions30d = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(contractorLeads)
      .where(
        and(
          eq(contractorLeads.signedUp, true),
          gte(contractorLeads.updatedAt, thirtyDaysAgo)
        )
      );

    // ── Messages ready count ─────────────────────────────────────────────────
    const [messagesReady] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(outreachMessages)
      .where(eq(outreachMessages.status, "pending_review"));

    // ── Top 10 next to send ──────────────────────────────────────────────────
    const nextToSend = await db
      .select({
        leadId: lgsOutreachQueue.leadId,
        queueId: lgsOutreachQueue.id,
        businessName: contractorLeads.businessName,
        email: contractorLeads.email,
        website: contractorLeads.website,
        leadScore: contractorLeads.leadScore,
        leadPriority: contractorLeads.leadPriority,
        outreachStage: contractorLeads.outreachStage,
        followupCount: contractorLeads.followupCount,
        subject: outreachMessages.subject,
        createdAt: lgsOutreachQueue.createdAt,
      })
      .from(lgsOutreachQueue)
      .innerJoin(outreachMessages, eq(lgsOutreachQueue.outreachMessageId, outreachMessages.id))
      .innerJoin(contractorLeads, eq(lgsOutreachQueue.leadId, contractorLeads.id))
      .where(eq(lgsOutreachQueue.sendStatus, "pending"))
      .orderBy(
        sql`CASE ${contractorLeads.leadPriority} WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
        lgsOutreachQueue.createdAt
      )
      .limit(10);

    // Find best available sender for display
    const availableSender = senderPanel.find(
      (s) => s.outreach_enabled && !s.is_cooling_down && s.remaining > 0
    );

    const nextToSendFormatted = nextToSend.map((row) => {
      const reasonCodes: QueueReasonCode[] = [];
      const priorityCode: QueueReasonCode =
        row.leadPriority === "high"
          ? "priority_high"
          : row.leadPriority === "medium"
            ? "priority_medium"
            : "priority_low";
      reasonCodes.push(priorityCode);

      if (availableSender) {
        reasonCodes.push("sender_capacity_ok");
      } else {
        reasonCodes.push("blocked_no_capacity");
      }

      const blockedStages = ["replied", "converted", "paused", "archived"];
      if (row.outreachStage && blockedStages.includes(row.outreachStage)) {
        const code = `blocked_stage_${row.outreachStage}` as QueueReasonCode;
        reasonCodes.push(code);
      }

      return {
        lead_id: row.leadId,
        queue_id: row.queueId,
        business_name: row.businessName,
        email: row.email,
        lead_score: row.leadScore ?? 0,
        lead_priority: row.leadPriority ?? "medium",
        outreach_stage: row.outreachStage ?? "not_contacted",
        followup_count: row.followupCount ?? 0,
        subject: row.subject,
        assigned_sender: availableSender?.email ?? null,
        reason_codes: reasonCodes,
        reason_labels: reasonCodes.map((c) => QUEUE_REASON_LABELS[c] ?? c),
      };
    });

    // ── Average sender health ────────────────────────────────────────────────
    const healthCounts = { good: 0, warning: 0, risk: 0, unknown: 0 };
    for (const s of senderPanel) {
      const h = s.health_score as keyof typeof healthCounts;
      if (h in healthCounts) healthCounts[h]++;
      else healthCounts.unknown++;
    }
    const avgHealth =
      senderPanel.length === 0
        ? "unknown"
        : healthCounts.good >= Math.ceil(senderPanel.length / 2)
          ? "good"
          : healthCounts.risk > 0
            ? "warning"
            : "warning";

    return NextResponse.json({
      ok: true,
      data: {
        lead_distribution: {
          high: Number(pc.high ?? 0),
          medium: Number(pc.medium ?? 0),
          low: Number(pc.low ?? 0),
          total_active: Number(pc.total_active ?? 0),
        },
        stage_counts: stageMap,
        sender_panel: senderPanel,
        followup_tracker: {
          due_today: Number(fc.due_today ?? 0),
          due_tomorrow: Number(fc.due_tomorrow ?? 0),
          overdue: Number(fc.overdue ?? 0),
        },
        metrics: {
          sent_today: Number(metrics?.sentToday ?? 0),
          pending_queue: Number(metrics?.pendingCount ?? 0),
          messages_ready: Number(messagesReady?.cnt ?? 0),
          replies_7d: Number(repliesWeek[0]?.cnt ?? 0),
          conversions_30d: Number(conversions30d[0]?.cnt ?? 0),
          avg_sender_health: avgHealth,
          high_priority_leads: Number(pc.high ?? 0),
        },
        next_to_send: nextToSendFormatted,
      },
    });
  } catch (err) {
    console.error("LGS brain dashboard error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
