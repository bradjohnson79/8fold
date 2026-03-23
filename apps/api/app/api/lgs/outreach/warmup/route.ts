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

type NextActivity = {
  at: string | null;
  type: "warmup_send" | "rollover" | null;
  label: string;
  reason: string | null;
};

function getNextActivityForSender(input: {
  nextWarmupSendAt: Date | null;
  nextRolloverAt: string | null;
  warmupStatus: string;
  remainingCapacity: number;
  effectiveWarmupBudget: number;
  warmupSentToday: number;
  warmupStabilityRequired: boolean;
}): NextActivity {
  if (input.nextWarmupSendAt) {
    return {
      at: input.nextWarmupSendAt.toISOString(),
      type: "warmup_send",
      label: "Next warmup send",
      reason: null,
    };
  }

  if (input.nextRolloverAt && (input.warmupStatus === "warming" || input.warmupStatus === "ready")) {
    let reason = "Current warmup window complete.";
    if (input.remainingCapacity <= 0) {
      reason = "Daily sending capacity exhausted.";
    } else if (input.effectiveWarmupBudget <= 0) {
      reason = input.warmupStabilityRequired
        ? "Stability day budget finished; next warmup window opens at rollover."
        : "No warmup sends remaining until rollover.";
    } else if (input.warmupSentToday >= input.effectiveWarmupBudget) {
      reason = input.warmupStabilityRequired
        ? "Today's stability-check sends are complete."
        : "Today's warmup sends are complete.";
    }

    return {
      at: input.nextRolloverAt,
      type: "rollover",
      label: "Next warmup window opens",
      reason,
    };
  }

  return {
    at: null,
    type: null,
    label: "No next activity scheduled",
    reason: null,
  };
}

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
      const stabilityVerified = r.warmupStabilityVerified ?? false;
      const stabilityStartedAt = r.warmupStabilityStartedAt?.toISOString() ?? null;
      const ready = isReadyForOutreach(day, status, stabilityVerified);
      const stabilityRequired = day >= 5 && !stabilityVerified;
      const stabilityStatus =
        day < 5
          ? "not_applicable"
          : stabilityVerified
            ? "complete"
            : stabilityStartedAt
              ? "in_progress"
              : "pending_start";

      const warmupSent = r.warmupSentToday ?? 0;
      const outreachSent = r.outreachSentToday ?? 0;
      const totalSent = warmupSent + outreachSent;
      const remaining = Math.max(0, (r.dailyLimit ?? 0) - totalSent);

      const warmupBudget =
        day >= 5
          ? Math.min(3, remaining)
          : (status === "warming" || status === "ready") ? remaining : 0;
      const outreachBudget = r.outreachEnabled ? Math.max(0, remaining - warmupBudget) : 0;

      const nextRollover =
        r.currentDayStartedAt
          ? new Date(new Date(r.currentDayStartedAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
          : null;

      const isCoolingDown = r.cooldownUntil && new Date(r.cooldownUntil) > new Date();
      const nextActivity = getNextActivityForSender({
        nextWarmupSendAt: r.nextWarmupSendAt ?? null,
        nextRolloverAt: nextRollover,
        warmupStatus: status,
        remainingCapacity: remaining,
        effectiveWarmupBudget: warmupBudget,
        warmupSentToday: warmupSent,
        warmupStabilityRequired: stabilityRequired,
      });

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
        warmup_stability_verified: stabilityVerified,
        warmup_stability_started_at: stabilityStartedAt,
        warmup_stability_required: stabilityRequired,
        warmup_stability_status: stabilityStatus,
        current_day_started_at: r.currentDayStartedAt?.toISOString() ?? null,
        next_rollover_at: nextRollover,
        // Safety fields
        cooldown_until: r.cooldownUntil?.toISOString() ?? null,
        is_cooling_down: !!isCoolingDown,
        health_score: r.healthScore ?? "unknown",
        // Warmup reliability fields
        next_warmup_send_at: r.nextWarmupSendAt?.toISOString() ?? null,
        next_activity_at: nextActivity.at,
        next_activity_type: nextActivity.type,
        next_activity_label: nextActivity.label,
        next_activity_reason: nextActivity.reason,
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
    const stabilityPendingCount = data.filter((d) => d.warmup_stability_required).length;
    const stabilityVerifiedCount = data.filter((d) => d.warmup_stability_verified).length;
    const outreachBlocked = (readyCount === 0 && data.length > 0) || stabilityPendingCount > 0;

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
    const nextActivityCandidates = data
      .filter((d) => d.next_activity_at)
      .map((d) => ({
        at: d.next_activity_at!,
        type: d.next_activity_type,
        label: d.next_activity_label,
        reason: d.next_activity_reason,
      }))
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const nextSystemActivity = nextActivityCandidates[0] ?? null;

    return NextResponse.json({
      ok: true,
      data,
      summary: {
        total_senders: data.length,
        warming,
        ready_for_outreach: readyCount,
        not_started: notStarted,
        outreach_blocked: outreachBlocked,
        stability_pending_count: stabilityPendingCount,
        stability_verified_count: stabilityVerifiedCount,
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
        next_system_warmup_send_at: nextSystemActivity?.type === "warmup_send" ? nextSystemActivity.at : null,
        next_system_activity_at: nextSystemActivity?.at ?? null,
        next_system_activity_type: nextSystemActivity?.type ?? null,
        next_system_activity_label: nextSystemActivity?.label ?? "No next activity scheduled",
        next_system_activity_reason: nextSystemActivity?.reason ?? null,
      },
    });
  } catch (err) {
    console.error("LGS warmup list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
