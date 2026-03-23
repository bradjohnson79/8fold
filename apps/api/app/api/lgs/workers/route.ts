/**
 * LGS: System Monitor — reports worker health with live DB metrics.
 */
import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  discoveryRuns,
  lgsOutreachQueue,
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

export async function GET() {
  try {
    const [
      lastDiscovery,
      outreachPending,
      outreachSentToday,
      msgPendingCount,
      activeSenders,
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
    ]);

    const discovery = lastDiscovery[0] ?? null;
    const discoveryRunning = discovery?.status === "running";

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
        description: "Sends approved messages via sender pool rotation",
        status: queueDepth > 0 ? "running" : "idle",
        last_run: sentToday > 0 ? "Today" : "—",
        jobs_processed: sentToday,
        detail: `${queueDepth} queued · ${sentToday} sent today · ${senderCount} active senders`,
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
        description: "Verifies lead emails via syntax, DNS, MX, and SMTP checks",
        status: "configured",
        last_run: "—",
        jobs_processed: 0,
        detail: "Threshold: 85. Runs during discovery.",
        schedule: "During discovery",
      },
      {
        name: "Bounce Monitor",
        description: "Tracks bounces and updates lead contact status",
        status: "future",
        last_run: "—",
        jobs_processed: 0,
        detail: "Coming soon",
        schedule: "—",
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
