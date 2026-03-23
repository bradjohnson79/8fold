/**
 * LGS Lead Finder: send staged domains to the Domain Discovery pipeline.
 * Chunks unsent domains into batches of 200 per discovery run.
 */
import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  leadFinderCampaigns,
  leadFinderDomains,
} from "@/db/schema/directoryEngine";
import { runBulkDomainDiscoveryAsync } from "@/src/services/lgs/domainDiscoveryService";

const BATCH_SIZE = 200;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [campaign] = await db
      .select({ id: leadFinderCampaigns.id, status: leadFinderCampaigns.status, state: leadFinderCampaigns.state })
      .from(leadFinderCampaigns)
      .where(eq(leadFinderCampaigns.id, id))
      .limit(1);

    if (!campaign) {
      return NextResponse.json({ ok: false, error: "campaign_not_found" }, { status: 404 });
    }

    // Fetch all unsent domains for this campaign
    const unsentDomains = await db
      .select()
      .from(leadFinderDomains)
      .where(
        and(
          eq(leadFinderDomains.campaignId, id),
          eq(leadFinderDomains.sentToDiscovery, false)
        )
      );

    if (unsentDomains.length === 0) {
      return NextResponse.json({
        ok: true,
        data: { batches_created: 0, domains_sent: 0, message: "No unsent domains found." },
      });
    }

    // Chunk into batches of 200
    const batches: (typeof unsentDomains)[] = [];
    for (let i = 0; i < unsentDomains.length; i += BATCH_SIZE) {
      batches.push(unsentDomains.slice(i, i + BATCH_SIZE));
    }

    const runIds: string[] = [];

    for (const batch of batches) {
      const domainRows = batch.map((d) => ({
        domain: d.domain,
        city: d.city ?? undefined,
        state: d.state ?? campaign.state ?? undefined,
      }));

      const runId = await runBulkDomainDiscoveryAsync(domainRows, {
        autoImportSource: "lead_finder",
      });
      runIds.push(runId);

      // Mark these domains as sent and record the discovery run id
      for (const domain of batch) {
        await db.update(leadFinderDomains)
          .set({ sentToDiscovery: true, discoveryRunId: runId })
          .where(eq(leadFinderDomains.id, domain.id));
      }
    }

    // Update campaign domains_sent counter
    await db.update(leadFinderCampaigns)
      .set({ domainsSent: sql`${leadFinderCampaigns.domainsSent} + ${unsentDomains.length}` })
      .where(eq(leadFinderCampaigns.id, id));

    return NextResponse.json({
      ok: true,
      data: {
        batches_created: batches.length,
        domains_sent: unsentDomains.length,
        discovery_run_ids: runIds,
      },
    });
  } catch (err) {
    console.error("LeadFinder send error:", err);
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 500 });
  }
}
