/**
 * LGS: Get discovery run progress status (for polling).
 * Returns all counters used in the import progress dashboard.
 */
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { discoveryDomainLogs, discoveryRuns } from "@/db/schema/directoryEngine";
import { triggerDiscoveryRun } from "@/src/services/lgs/discoveryRunTriggerService";

const STALL_THRESHOLD_MS = 60_000;
const START_TRIGGER_THRESHOLD_MS = 3_000;

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: runId } = await params;
    if (!runId) {
      return NextResponse.json({ ok: false, error: "run_id_required" }, { status: 400 });
    }

    const [run] = await db
      .select()
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, runId))
      .limit(1);

    if (!run) {
      return NextResponse.json({ ok: false, error: "run_not_found" }, { status: 404 });
    }

    const [lastActivityRow] = await db
      .select({
        lastActivityAt: sql<Date | null>`max(${discoveryDomainLogs.createdAt})`,
      })
      .from(discoveryDomainLogs)
      .where(eq(discoveryDomainLogs.runId, runId));

    const now = Date.now();
    const origin = new URL(req.url).origin;
    const startedAt = asDate(run.startedAt);
    const createdAt = asDate(run.createdAt);
    const finishedAt = asDate(run.finishedAt);
    const lastActivityAt = asDate(lastActivityRow?.lastActivityAt) ?? startedAt ?? createdAt;
    const lastActivityMs = lastActivityAt ? now - lastActivityAt.getTime() : null;
    const terminalStatuses = new Set(["complete", "complete_with_errors", "failed", "cancelled"]);
    const rawStatus = run.status ?? "running";
    const shouldKickPendingRun =
      rawStatus === "pending" &&
      (lastActivityMs === null || lastActivityMs >= START_TRIGGER_THRESHOLD_MS);
    const shouldKickStalledRun =
      rawStatus === "stalled" &&
      (lastActivityMs === null || lastActivityMs >= START_TRIGGER_THRESHOLD_MS);

    if (shouldKickPendingRun || shouldKickStalledRun) {
      console.log("[LGS] Re-triggering discovery run", {
        runId,
        rawStatus,
        lastActivityMs,
      });
      triggerDiscoveryRun(origin, runId, rawStatus === "stalled" ? "status_retry_stalled" : "status_retry_pending");
    }

    const isStalled =
      !terminalStatuses.has(rawStatus) &&
      rawStatus !== "cancel_requested" &&
      lastActivityMs !== null &&
      lastActivityMs >= STALL_THRESHOLD_MS;
    const effectiveStatus = isStalled ? "stalled" : rawStatus === "pending" ? "running" : rawStatus;

    if (isStalled && rawStatus !== "stalled") {
      await db
        .update(discoveryRuns)
        .set({ status: "stalled" })
        .where(eq(discoveryRuns.id, runId));
    }

    // Compute derived timing metrics
    const elapsedMs =
      run.elapsedMs ??
      (startedAt ? now - startedAt.getTime() : null);
    const domainsProcessed = run.domainsProcessed ?? 0;
    const avgDomainsPerSecond =
      elapsedMs && elapsedMs > 0 && domainsProcessed > 0
        ? Math.round((domainsProcessed / (elapsedMs / 1000)) * 10) / 10
        : null;

    const formatDuration = (ms: number | null): string | null => {
      if (ms === null) return null;
      const totalSecs = Math.round(ms / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    return NextResponse.json({
      ok: true,
      data: {
        run_id: run.id,
        status: effectiveStatus,
        raw_status: rawStatus,
        lead_type: run.campaignType === "jobs" ? "job_poster" : "contractor",
        // Domain counters
        domains_total: run.domainsTotal ?? 0,
        domains_processed: domainsProcessed,
        progress_pct: run.domainsTotal && run.domainsTotal > 0
          ? Math.floor((domainsProcessed / run.domainsTotal) * 100)
          : 0,
        successful_domains: run.successfulDomains ?? 0,
        failed_domains: run.failedDomains ?? 0,
        skipped_domains: run.skippedDomains ?? 0,
        removed_domains: run.domainsDiscarded ?? 0,
        // Email counters (precise terminology)
        emails_found: run.emailsFound ?? 0,
        qualified_emails: run.qualifiedEmails ?? 0,
        rejected_emails: run.rejectedEmails ?? 0,
        // Lead counters
        inserted_leads: run.insertedLeads ?? 0,
        duplicates_skipped: run.duplicatesSkipped ?? 0,
        // Legacy aliases
        emails_verified: run.emailsVerified ?? 0,
        contacts_found: run.contactsFound ?? 0,
        // Timing
        started_at: startedAt?.toISOString() ?? null,
        finished_at: finishedAt?.toISOString() ?? null,
        heartbeat_at: lastActivityAt?.toISOString() ?? null,
        stalled: isStalled,
        elapsed_ms: elapsedMs,
        elapsed_display: formatDuration(elapsedMs),
        avg_domains_per_second: avgDomainsPerSecond,
      },
    });
  } catch (err) {
    console.error("LGS discovery status error:", err);
    // Status polling must NEVER return 500 — the frontend polls every 2s and
    // a 500 breaks the progress UI.  Return 200 + ok:false so the poller
    // silently retries on the next tick.
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "get_failed" },
      { status: 200 }
    );
  }
}
