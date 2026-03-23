/**
 * LGS: System Monitor — reports worker health with live DB metrics.
 */
import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  discoveryRuns,
  emailVerificationQueue,
  jobPosterLeads,
  jobPosterEmailMessages,
  jobPosterEmailQueue,
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
      jobPosterQueuePending,
      jobPosterSentToday,
      jobPosterPendingReview,
      activeSenders,
      readyContractorAssignments,
      readyJobAssignments,
      pendingContractorOutreach,
      pendingJobOutreach,
      approvedContractorOutreach,
      approvedJobOutreach,
      pendingVerificationQueue,
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
        .from(jobPosterEmailQueue)
        .where(eq(jobPosterEmailQueue.status, "pending")),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobPosterEmailQueue)
        .where(
          sql`${jobPosterEmailQueue.sentAt} >= current_date and ${jobPosterEmailQueue.status} = 'sent'`
        ),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobPosterEmailMessages)
        .where(eq(jobPosterEmailMessages.status, "draft")),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(senderPool)
        .where(eq(senderPool.status, "active")),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(eq(contractorLeads.assignmentStatus, "ready")),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobPosterLeads)
        .where(eq(jobPosterLeads.assignmentStatus, "ready")),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(eq(contractorLeads.outreachStatus, "pending")),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobPosterLeads)
        .where(eq(jobPosterLeads.outreachStatus, "pending")),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contractorLeads)
        .where(eq(contractorLeads.outreachStatus, "approved")),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobPosterLeads)
        .where(eq(jobPosterLeads.outreachStatus, "approved")),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(emailVerificationQueue)
        .where(eq(emailVerificationQueue.status, "pending")),
    ]);

    const discovery = lastDiscovery[0] ?? null;
    const discoveryRunning = discovery?.status === "running";

    const queueDepth = outreachPending[0]?.count ?? 0;
    const sentToday = outreachSentToday[0]?.count ?? 0;
    const pendingMessages = msgPendingCount[0]?.count ?? 0;
    const jobPosterQueueDepth = jobPosterQueuePending[0]?.count ?? 0;
    const jobPosterSent = jobPosterSentToday[0]?.count ?? 0;
    const jobPosterDrafts = jobPosterPendingReview[0]?.count ?? 0;
    const senderCount = activeSenders[0]?.count ?? 0;
    const readyAssignments = (readyContractorAssignments[0]?.count ?? 0) + (readyJobAssignments[0]?.count ?? 0);
    const pendingGeneration = (pendingContractorOutreach[0]?.count ?? 0) + (pendingJobOutreach[0]?.count ?? 0);
    const approvedToQueue = (approvedContractorOutreach[0]?.count ?? 0) + (approvedJobOutreach[0]?.count ?? 0);
    const verificationQueueDepth = pendingVerificationQueue[0]?.count ?? 0;

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
        status: queueDepth > 0 || jobPosterQueueDepth > 0 ? "running" : "idle",
        last_run: sentToday > 0 ? "Today" : "—",
        jobs_processed: sentToday + jobPosterSent,
        detail: `${queueDepth} contractor queued · ${jobPosterQueueDepth} job poster queued · ${sentToday + jobPosterSent} sent today · ${senderCount} active senders`,
        schedule: "Every 1 min",
      },
      {
        name: "Auto Assignment Worker",
        description: "Matches ready leads to the correct campaign and marks them assigned",
        status: readyAssignments > 0 ? "running" : "idle",
        last_run: readyAssignments > 0 ? "Pending work" : "—",
        jobs_processed: readyAssignments,
        detail: `${readyContractorAssignments[0]?.count ?? 0} contractor ready · ${readyJobAssignments[0]?.count ?? 0} job poster ready`,
        schedule: "Every 1 min",
      },
      {
        name: "Outreach Automation Worker",
        description: "Generates first-touch drafts for assigned leads and auto-queues approved messages",
        status: pendingGeneration > 0 || approvedToQueue > 0 ? "running" : "idle",
        last_run: pendingGeneration > 0 || approvedToQueue > 0 ? "Pending work" : "—",
        jobs_processed: pendingGeneration + approvedToQueue,
        detail: `${pendingGeneration} pending generation · ${approvedToQueue} approved waiting for queue`,
        schedule: "Every 1 min",
      },
      {
        name: "Message Generation Worker",
        description: "GPT-5 Nano message generation for approved leads",
        status: pendingMessages > 0 ? "idle" : "idle",
        last_run: "On-demand",
        jobs_processed: pendingMessages + jobPosterDrafts,
        detail: `${pendingMessages} contractor review · ${jobPosterDrafts} job poster draft review`,
        schedule: "On-demand",
      },
      {
        name: "Verification Worker",
        description: "Processes queued email checks and updates lead priority scores",
        status: verificationQueueDepth > 0 ? "running" : "idle",
        last_run: verificationQueueDepth > 0 ? "Pending work" : "—",
        jobs_processed: verificationQueueDepth,
        detail: `${verificationQueueDepth} email(s) waiting for verification`,
        schedule: "Every 5 min",
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
