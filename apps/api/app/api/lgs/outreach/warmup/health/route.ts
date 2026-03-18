import { NextResponse } from "next/server";
import { desc, eq, or } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { senderPool, lgsWorkerHealth, lgsWarmupActivity } from "@/db/schema/directoryEngine";
import { hasGmailTokenForSender } from "@/src/services/lgs/outreachGmailSenderService";
import { INTERNAL_SENDERS, EXTERNAL_TARGETS } from "@/src/services/lgs/warmupEngine";
import { enforceWarmupSystemState, getWarmupWorkerStatus, validateWarmupSystem } from "@/src/services/lgs/warmupSystem";

export async function GET() {
  try {
    await enforceWarmupSystemState();

    // Worker health
    const [workerRow] = await db
      .select()
      .from(lgsWorkerHealth)
      .where(eq(lgsWorkerHealth.workerName, "warmup"))
      .limit(1);

    const heartbeatStatus = getWarmupWorkerStatus(workerRow?.lastHeartbeatAt);
    const heartbeatAgeMs = workerRow?.lastHeartbeatAt
      ? Date.now() - new Date(workerRow.lastHeartbeatAt).getTime()
      : Infinity;

    const validation = await validateWarmupSystem();

    // Active senders
    const senders = await db
      .select()
      .from(senderPool)
      .where(
        or(
          eq(senderPool.warmupStatus, "warming"),
          eq(senderPool.warmupStatus, "ready")
        )
      );

    const activeSendersExist = senders.length > 0;
    const gmailTokens = senders.map((s) => ({
      email: s.senderEmail,
      hasToken: hasGmailTokenForSender(s.senderEmail ?? ""),
    }));
    const allTokensValid = gmailTokens.every((t) => t.hasToken);

    // Next send timing
    const nextSendTimes = senders
      .filter((s) => s.nextWarmupSendAt)
      .map((s) => s.nextWarmupSendAt!.toISOString())
      .sort();
    const nextSendComputed = nextSendTimes.length > 0;

    // Recent activity
    const [recentActivity] = await db
      .select()
      .from(lgsWarmupActivity)
      .orderBy(desc(lgsWarmupActivity.sentAt))
      .limit(1);
    const recentActivityExists = !!recentActivity;

    // Target pools
    const internalPoolConfigured = INTERNAL_SENDERS.length > 0;
    const externalPoolConfigured = EXTERNAL_TARGETS.length > 0;

    // Checks
    const checks = [
      { name: "active_senders", pass: activeSendersExist },
      { name: "gmail_tokens", pass: allTokensValid, detail: gmailTokens },
      { name: "worker_heartbeat", pass: heartbeatStatus === "healthy" },
      { name: "next_send_computed", pass: nextSendComputed },
      { name: "recent_activity", pass: recentActivityExists },
      { name: "internal_target_pool", pass: internalPoolConfigured },
      { name: "external_target_pool", pass: externalPoolConfigured },
      { name: "validation_gate", pass: validation.pass, detail: validation.reasons },
    ];

    const passCount = checks.filter((c) => c.pass).length;
    const failCount = checks.length - passCount;
    let overallStatus: string;
    if (failCount === 0 && heartbeatStatus === "healthy") overallStatus = "pass";
    else if (failCount <= 2 && heartbeatStatus !== "stale") overallStatus = "warn";
    else overallStatus = "fail";

    return NextResponse.json({
      ok: true,
      data: {
        overall_status: overallStatus,
        heartbeat_status: heartbeatStatus,
        heartbeat_age_seconds: Math.round(heartbeatAgeMs / 1000),
        worker: workerRow
          ? {
              last_heartbeat_at: workerRow.lastHeartbeatAt?.toISOString() ?? null,
              last_run_started_at: workerRow.lastRunStartedAt?.toISOString() ?? null,
              last_run_finished_at: workerRow.lastRunFinishedAt?.toISOString() ?? null,
              last_run_status: workerRow.lastRunStatus,
              last_error: workerRow.lastError,
            }
          : null,
        checks,
        pass_count: passCount,
        fail_count: failCount,
        validation,
      },
    });
  } catch (err) {
    console.error("LGS warmup health error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
