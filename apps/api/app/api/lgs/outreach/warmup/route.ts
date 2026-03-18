import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  lgsOutreachQueue,
  lgsWarmupActivity,
  lgsWorkerHealth,
  senderPool,
} from "@/db/schema/directoryEngine";
import { WARMUP_SCHEDULE, isReadyForOutreach } from "@/src/services/lgs/warmupSchedule";

type WorkerStatus = "healthy" | "warning" | "stale";

function toIso(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

function getWorkerStatus(lastHeartbeatAt: Date | null | undefined): WorkerStatus {
  if (!lastHeartbeatAt) return "stale";

  const ageMs = Date.now() - new Date(lastHeartbeatAt).getTime();
  if (ageMs < 10 * 60_000) return "healthy";
  if (ageMs < 20 * 60_000) return "warning";
  return "stale";
}

export async function GET() {
  try {
    const [rows, pendingRow, workerRow, recentActivity] = await Promise.all([
      db.select().from(senderPool).orderBy(senderPool.senderEmail),
      db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(lgsOutreachQueue)
        .where(eq(lgsOutreachQueue.sendStatus, "pending"))
        .then((result) => result[0]),
      db
        .select()
        .from(lgsWorkerHealth)
        .where(eq(lgsWorkerHealth.workerName, "warmup"))
        .limit(1)
        .then((result) => result[0] ?? null),
      db
        .select()
        .from(lgsWarmupActivity)
        .orderBy(desc(lgsWarmupActivity.sentAt))
        .limit(1)
        .then((result) => result[0] ?? null),
    ]);

    const perSenderActivity = await Promise.all(
      rows.map((sender) =>
        db
          .select()
          .from(lgsWarmupActivity)
          .where(eq(lgsWarmupActivity.senderEmail, sender.senderEmail))
          .orderBy(desc(lgsWarmupActivity.sentAt))
          .limit(100)
      )
    );

    const data = rows.map((sender, index) => {
      const activityRows = perSenderActivity[index] ?? [];
      const latestActivity = activityRows[0] ?? null;
      const warmupStatus = sender.warmupStatus ?? "not_started";
      const warmupDay = sender.warmupDay ?? 0;
      const dailyLimit = sender.dailyLimit ?? 0;
      const warmupSentToday = sender.warmupSentToday ?? 0;
      const outreachSentToday = sender.outreachSentToday ?? 0;
      const sentToday = warmupSentToday + outreachSentToday;
      const remainingCapacity = Math.max(0, dailyLimit - sentToday);
      const warmupBudget = sender.outreachEnabled
        ? Math.min(3, remainingCapacity)
        : (warmupStatus === "warming" || warmupStatus === "ready")
          ? remainingCapacity
          : 0;
      const readyForOutreach = isReadyForOutreach(warmupDay, dailyLimit);
      const isCoolingDown = !!sender.cooldownUntil && new Date(sender.cooldownUntil) > new Date();

      let consecutiveFailures = 0;
      for (const activity of activityRows) {
        if (activity.status === "sent") break;
        consecutiveFailures += 1;
      }

      let nextSendState = "not_applicable";
      if (warmupStatus === "paused") {
        nextSendState = "paused";
      } else if (isCoolingDown) {
        nextSendState = "blocked";
      } else if (warmupStatus === "warming" || warmupStatus === "ready") {
        if (remainingCapacity <= 0 || warmupSentToday >= warmupBudget) {
          nextSendState = "complete_for_day";
        } else if (sender.nextWarmupSendAt) {
          nextSendState = "scheduled";
        } else {
          nextSendState = "missing_schedule";
        }
      }

      let dashboardStatus = warmupStatus;
      if (
        (warmupStatus === "warming" || warmupStatus === "ready") &&
        (sender.lastWarmupResult === "error" || consecutiveFailures > 0)
      ) {
        dashboardStatus = "error";
      } else if (readyForOutreach) {
        dashboardStatus = "ready";
      }

      return {
        id: sender.id,
        email: sender.senderEmail,
        sender_status: sender.status,
        warmup_status: warmupStatus,
        dashboard_status: dashboardStatus,
        warmup_day: warmupDay,
        daily_limit: dailyLimit,
        sent_today: sentToday,
        warmup_sent_today: warmupSentToday,
        outreach_sent_today: outreachSentToday,
        remaining_capacity: remainingCapacity,
        current_day_started_at: toIso(sender.currentDayStartedAt),
        next_warmup_send_at: toIso(sender.nextWarmupSendAt),
        next_send_state: nextSendState,
        last_warmup_sent_at: toIso(sender.lastWarmupSentAt),
        last_warmup_result: sender.lastWarmupResult ?? null,
        last_warmup_recipient: sender.lastWarmupRecipient ?? null,
        last_activity_at: toIso(latestActivity?.sentAt),
        last_activity_status: latestActivity?.status ?? null,
        last_activity_recipient: latestActivity?.recipientEmail ?? null,
        last_activity_type: latestActivity?.messageType ?? null,
        last_activity_error: latestActivity?.errorMessage ?? null,
        is_ready_for_outreach: readyForOutreach,
        outreach_enabled: sender.outreachEnabled ?? false,
        consecutive_failures: consecutiveFailures,
        health_score: sender.healthScore ?? null,
        cooldown_until: toIso(sender.cooldownUntil),
        is_cooling_down: isCoolingDown,
      };
    });

    const activeSenders = data.filter(
      (sender) => sender.warmup_status === "warming" || sender.warmup_status === "ready"
    );
    const nextSystemWarmupSendAt =
      activeSenders
        .map((sender) => sender.next_warmup_send_at)
        .filter((value): value is string => value !== null)
        .sort()[0] ?? null;
    const workerStatus = getWorkerStatus(workerRow?.lastHeartbeatAt);

    return NextResponse.json({
      ok: true,
      data,
      summary: {
        total_senders: data.length,
        warming_senders: data.filter((sender) => sender.warmup_status === "warming").length,
        ready_senders: data.filter((sender) => sender.is_ready_for_outreach).length,
        outreach_enabled_count: data.filter((sender) => sender.outreach_enabled).length,
        pending_queue_count: Number(pendingRow?.cnt ?? 0),
        next_system_warmup_send_at: nextSystemWarmupSendAt,
        last_warmup_activity_at: toIso(recentActivity?.sentAt),
        last_warmup_activity: recentActivity
          ? {
              sender_email: recentActivity.senderEmail,
              recipient_email: recentActivity.recipientEmail,
              message_type: recentActivity.messageType,
              status: recentActivity.status,
              error_message: recentActivity.errorMessage,
              sent_at: toIso(recentActivity.sentAt),
            }
          : null,
        worker_last_heartbeat_at: toIso(workerRow?.lastHeartbeatAt),
        worker_last_run_started_at: toIso(workerRow?.lastRunStartedAt),
        worker_last_run_finished_at: toIso(workerRow?.lastRunFinishedAt),
        worker_last_run_status: workerRow?.lastRunStatus ?? null,
        worker_status: workerStatus,
        schedule: WARMUP_SCHEDULE,
      },
    });
  } catch (err) {
    console.error("LGS warmup list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
