/**
 * LGS: Email warmup overview — list all senders with warmup status,
 * split counters, effective capacity budgets, and system-level totals.
 */
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { senderPool, lgsOutreachQueue, lgsWorkerHealth } from "@/db/schema/directoryEngine";
import {
  WARMUP_SCHEDULE,
  getDailyLimit,
  getNextDayLimit,
  isReadyForOutreach,
} from "@/src/services/lgs/warmupSchedule";

export async function GET() {
  try {
    const rows = await db.select().from(senderPool).orderBy(senderPool.senderEmail);

    // Pending queue count
    const [pendingRow] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(lgsOutreachQueue)
      .where(eq(lgsOutreachQueue.sendStatus, "pending"));
    const pendingQueueCount = Number(pendingRow?.cnt ?? 0);

    const data = rows.map((r) => {
      const day = r.warmupDay ?? 0;
      const status = r.warmupStatus ?? "not_started";
      const currentLimit = getDailyLimit(day);
      const nextLimit = getNextDayLimit(day);
      const ready = isReadyForOutreach(day, status);

      const warmupSent = r.warmupSentToday ?? 0;
      const outreachSent = r.outreachSentToday ?? 0;
      const totalSent = warmupSent + outreachSent;
      const remaining = Math.max(0, (r.dailyLimit ?? 0) - totalSent);

      const warmupBudget =
        r.outreachEnabled
          ? Math.min(3, remaining)
          : (status === "warming" || status === "ready") ? remaining : 0;
      const outreachBudget = Math.max(0, remaining - warmupBudget);

      const nextRollover =
        r.currentDayStartedAt
          ? new Date(new Date(r.currentDayStartedAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
          : null;

      const isCoolingDown = r.cooldownUntil && new Date(r.cooldownUntil) > new Date();

      return {
        id: r.id,
        sender_email: r.senderEmail,
        sender_status: r.status,
        warmup_status: status,
        warmup_day: day,
        warmup_started_at: r.warmupStartedAt?.toISOString() ?? null,
        warmup_emails_sent_today: r.warmupEmailsSentToday ?? 0,
        warmup_total_sent: r.warmupTotalSent ?? 0,
        warmup_total_replies: r.warmupTotalReplies ?? 0,
        warmup_inbox_placement: r.warmupInboxPlacement ?? "unknown",
        daily_warmup_limit: currentLimit,
        next_day_limit: nextLimit,
        ready_for_outreach: ready,
        daily_outreach_limit: r.dailyLimit,
        sent_today: r.sentToday,
        warmup_sent_today: warmupSent,
        outreach_sent_today: outreachSent,
        total_sent_today: totalSent,
        remaining_capacity: remaining,
        effective_warmup_budget: warmupBudget,
        effective_outreach_budget: outreachBudget,
        outreach_enabled: r.outreachEnabled ?? false,
        current_day_started_at: r.currentDayStartedAt?.toISOString() ?? null,
        next_rollover_at: nextRollover,
        // Safety fields
        cooldown_until: r.cooldownUntil?.toISOString() ?? null,
        is_cooling_down: !!isCoolingDown,
        health_score: r.healthScore ?? "unknown",
        // Warmup reliability fields
        next_warmup_send_at: r.nextWarmupSendAt?.toISOString() ?? null,
        last_warmup_sent_at: r.lastWarmupSentAt?.toISOString() ?? null,
        last_warmup_result: r.lastWarmupResult ?? null,
        last_warmup_recipient: r.lastWarmupRecipient ?? null,
      };
    });

    // Summary metrics
    const managedStatuses = ["warming", "ready"];
    const managedSenders = data.filter((d) =>
      managedStatuses.includes(d.warmup_status)
    );

    const warming = data.filter((d) => d.warmup_status === "warming").length;
    const readyCount = data.filter((d) => d.ready_for_outreach).length;
    const notStarted = data.filter((d) => d.warmup_status === "not_started").length;
    const outreachBlocked = readyCount === 0 && data.length > 0;

    const systemDailyCapacity = managedSenders.reduce(
      (sum, d) => sum + (d.daily_outreach_limit ?? 0),
      0
    );
    const systemSentToday = managedSenders.reduce(
      (sum, d) => sum + d.total_sent_today,
      0
    );
    const systemRemaining = managedSenders.reduce(
      (sum, d) => sum + d.remaining_capacity,
      0
    );
    const systemOutreachCapacity = managedSenders.reduce(
      (sum, d) => sum + d.effective_outreach_budget,
      0
    );
    const systemWarmupCapacity = managedSenders.reduce(
      (sum, d) => sum + d.effective_warmup_budget,
      0
    );
    const outreachEnabledCount = data.filter((d) => d.outreach_enabled).length;

    // Worker health
    const [workerRow] = await db
      .select()
      .from(lgsWorkerHealth)
      .where(eq(lgsWorkerHealth.workerName, "warmup"))
      .limit(1);

    let workerStatus = "unknown";
    if (workerRow?.lastHeartbeatAt) {
      const ageMs = Date.now() - new Date(workerRow.lastHeartbeatAt).getTime();
      if (ageMs < 10 * 60_000) workerStatus = "healthy";
      else if (ageMs < 20 * 60_000) workerStatus = "warning";
      else workerStatus = "stale";
    }

    // Earliest next warmup send across all senders
    const nextSendTimes = data
      .map((d) => d.next_warmup_send_at)
      .filter((t): t is string => t !== null)
      .sort();
    const nextSystemWarmupSendAt = nextSendTimes[0] ?? null;

    return NextResponse.json({
      ok: true,
      data,
      summary: {
        total_senders: data.length,
        warming,
        ready_for_outreach: readyCount,
        not_started: notStarted,
        outreach_blocked: outreachBlocked,
        schedule: WARMUP_SCHEDULE,
        system_daily_capacity: systemDailyCapacity,
        system_sent_today: systemSentToday,
        system_remaining: systemRemaining,
        system_outreach_capacity: systemOutreachCapacity,
        system_warmup_capacity: systemWarmupCapacity,
        pending_queue_count: pendingQueueCount,
        outreach_enabled_count: outreachEnabledCount,
        worker_status: workerStatus,
        worker_last_heartbeat: workerRow?.lastHeartbeatAt?.toISOString() ?? null,
        worker_last_run_status: workerRow?.lastRunStatus ?? null,
        next_system_warmup_send_at: nextSystemWarmupSendAt,
      },
    });
  } catch (err) {
    console.error("LGS warmup list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
