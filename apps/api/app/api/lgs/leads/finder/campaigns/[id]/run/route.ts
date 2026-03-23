/**
 * LGS Lead Finder: (re)start a campaign.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  leadFinderCampaigns,
  leadFinderDomains,
  leadFinderJobs,
} from "@/db/schema/directoryEngine";
import { runLeadFinderCampaign } from "@/src/services/lgs/leadFinderService";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [campaign] = await db
      .select({ id: leadFinderCampaigns.id, status: leadFinderCampaigns.status })
      .from(leadFinderCampaigns)
      .where(eq(leadFinderCampaigns.id, id))
      .limit(1);

    if (!campaign) {
      return NextResponse.json({ ok: false, error: "campaign_not_found" }, { status: 404 });
    }

    if (campaign.status === "running") {
      return NextResponse.json({ ok: false, error: "campaign_already_running" }, { status: 409 });
    }

    // Reset prior staged data for a clean re-run.
    await db.delete(leadFinderDomains).where(eq(leadFinderDomains.campaignId, id));
    await db.delete(leadFinderJobs).where(eq(leadFinderJobs.campaignId, id));

    // Reset counters for re-run
    await db.update(leadFinderCampaigns)
      .set({
        status: "draft",
        startedAt: null,
        finishedAt: null,
        elapsedSeconds: null,
        domainsPerSecond: null,
        jobsTotal: 0,
        jobsComplete: 0,
        domainsFound: 0,
        uniqueDomains: 0,
        domainsSent: 0,
        errorMessage: null,
      })
      .where(eq(leadFinderCampaigns.id, id));

    setImmediate(() => {
      runLeadFinderCampaign(id).catch((err) => {
        console.error(`[LeadFinder] Campaign ${id} error:`, err);
        db.update(leadFinderCampaigns)
          .set({ status: "failed", errorMessage: err instanceof Error ? err.message : "unknown", finishedAt: new Date() })
          .then(() => {});
      });
    });

    return NextResponse.json({ ok: true, data: { campaign_id: id, status: "running" } });
  } catch (err) {
    console.error("LeadFinder run error:", err);
    return NextResponse.json({ ok: false, error: "run_failed" }, { status: 500 });
  }
}
