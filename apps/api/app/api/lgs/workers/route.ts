/**
 * LGS: System Monitor — reports worker health with live DB metrics.
 */
import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  discoveryRuns,
  lgsOutreachQueue,
  lgsWorkerHealth,
  outreachMessages,
  senderPool,
} from "@/db/schema/directoryEngine";

function timeAgo(date: Date | null): string {
  if (!date) return "Never";
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function getWorkerStatus(health: { lastHeartbeatAt: Date | null; lastRunStatus: string | null } | null) {
  const heartbeatAge = health?.lastHeartbeatAt
    ? (Date.now() - health.lastHeartbeatAt.getTime()) / 1000
    : null;

  if (health?.lastRunStatus === "error") return "error" as const;
  if (heartbeatAge === null) return "stopped" as const;
  if (heartbeatAge < 120) return "running" as const;
  if (heartbeatAge < 3600) return "idle" as const;
  return "stopped" as const;
}

export async function GET() {
  try {
    const [
      lastDiscovery,
      outreachPending,
      outreachSentToday,
      msgPendingCount,
      activeSenders,
      outreachHealth,
      repliesHealth,
      verificationHealth,
    ] = await Promise.all([
      db
        .select({
          status: discoveryRuns.status,
          createdAt: discoveryRuns.createdAt,
          domainsTotal: discoveryRuns.domainsTotal,
          domainsProcessed: discoveryRuns.domainsProcessed,
          insertedLeads: discoveryRuns.insertedLeads,
        })
        .from(discoveryRuns)
        .orderBy(desc(discoveryRuns.createdAt))
        .limit(1),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(lgsOutreachQueue)
        .where(eq(lgsOutreachQueue.sendStatus, "pending")),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(lgsOutreachQueue)
        .where(
          sql`${lgsOutreachQueue.sentAt} >= current_date and ${lgsOutreachQueue.sendStatus} = 'sent'`
        ),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(outreachMessages)
        .where(eq(outreachMessages.status, "pending_review")),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(senderPool)
        .where(eq(senderPool.status, "active")),

      db
        .select({
          lastHeartbeatAt: lgsWorkerHealth.lastHeartbeatAt,
          lastRunStatus: lgsWorkerHealth.lastRunStatus,
          lastError: lgsWorkerHealth.lastError,
        })
        .from(lgsWorkerHealth)
        .where(eq(lgsWorkerHealth.workerName, "outreach_cron"))
        .limit(1),

      db
        .select({
          lastHeartbeatAt: lgsWorkerHealth.lastHeartbeatAt,
          lastRunStatus: lgsWorkerHealth.lastRunStatus,
          lastError: lgsWorkerHealth.lastError,
        })
        .from(lgsWorkerHealth)
        .where(eq(lgsWorkerHealth.workerName, "replies_cron"))
        .limit(1),

      db
        .select({
          lastHeartbeatAt: lgsWorkerHealth.lastHeartbeatAt,
          lastRunStatus: lgsWorkerHealth.lastRunStatus,
          lastError: lgsWorkerHealth.lastError,
        })
        .from(lgsWorkerHealth)
        .where(eq(lgsWorkerHealth.workerName, "verification_cron"))
        .limit(1),
    ]);

    const discovery = lastDiscovery[0] ?? null;
    const discoveryRunning = discovery?.status === "running";

    const outreach = outreachHealth[0] ?? null;
    const replies = repliesHealth[0] ?? null;
    const verifyHealth = verificationHealth[0] ?? null;
    const outreachStatus = getWorkerStatus(outreach);
    const repliesStatus = getWorkerStatus(replies);
    const verifyStatus = getWorkerStatus(verifyHealth);

    const queueDepth = outreachPending[0]?.count ?? 0;
    const sentToday = outreachSentToday[0]?.count ?? 0;
    const pendingMessages = msgPendingCount[0]?.count ?? 0;
    const senderCount = activeSenders[0]?.count ?? 0;

    const workers = [
      {
        name: "Discovery Worker",
        description: "Bulk domain scan — crawls sites and extracts contractor emails",
        status: discoveryRunning ? "running" : discovery ? "idle" : "stopped",
        last_run: timeAgo(discovery?.createdAt ?? null),
        jobs_processed: discovery?.insertedLeads ?? 0,
        detail: discovery
          ? `${discovery.domainsProcessed ?? 0}/${discovery.domainsTotal ?? 0} domains`
          : "No runs yet",
        schedule: "On-demand",
      },
      {
        name: "Outreach Worker",
        description: "Queues approved messages and dispatches the next eligible outreach send",
        status: outreachStatus,
        last_run: timeAgo(outreach?.lastHeartbeatAt ?? null),
        jobs_processed: sentToday,
        detail: outreach
          ? outreach.lastRunStatus === "error"
            ? `Last error: ${outreach.lastError ?? "unknown"}`
            : `${queueDepth} queued · ${sentToday} sent today · ${senderCount} active senders`
          : "Not yet run — will start on next cron tick",
        schedule: "Every 1 min",
      },
      {
        name: "Message Generation Worker",
        description: "GPT-5 Nano message generation for approved leads",
        status: pendingMessages > 0 ? "idle" : "idle",
        last_run: "On-demand",
        jobs_processed: pendingMessages,
        detail: `${pendingMessages} messages awaiting review`,
        schedule: "On-demand",
      },
      {
        name: "Verification Worker",
        description: "Verifies lead emails via DNS, MX, and SMTP checks · auto-enqueues pending leads",
        status: verifyStatus,
        last_run: timeAgo(verifyHealth?.lastHeartbeatAt ?? null),
        jobs_processed: 0,
        detail: verifyHealth
          ? verifyHealth.lastRunStatus === "error"
            ? `Last error: ${verifyHealth.lastError ?? "unknown"}`
            : `Last run: ${timeAgo(verifyHealth.lastHeartbeatAt ?? null)}`
          : "Not yet run — will start on next cron tick",
        schedule: "Every 1 min",
      },
      {
        name: "Reply Processor",
        description: "Scans tracked inboxes for replies and bounces across both outreach pipelines",
        status: repliesStatus,
        last_run: timeAgo(replies?.lastHeartbeatAt ?? null),
        jobs_processed: 0,
        detail: replies
          ? replies.lastRunStatus === "error"
            ? `Last error: ${replies.lastError ?? "unknown"}`
            : "Inbound Gmail sync is healthy"
          : "Not yet run — will start on next cron tick",
        schedule: "Every 5 min",
      },
    ];

    const system = {
      active_workers: workers.filter((w) => w.status === "running").length,
      queue_depth: queueDepth,
      sent_today: sentToday,
      pending_review: pendingMessages,
      active_senders: senderCount,
    };

    return NextResponse.json({ ok: true, data: workers, system });
  } catch (err) {
    console.error("LGS workers error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
