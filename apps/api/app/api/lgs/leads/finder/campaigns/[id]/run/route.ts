/**
 * LGS Lead Finder: (re)start a campaign.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { leadFinderCampaigns } from "@/db/schema/directoryEngine";
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

    // Reset counters for re-run
    await db.update(leadFinderCampaigns)
      .set({ status: "draft", startedAt: null, finishedAt: null, elapsedSeconds: null, errorMessage: null })
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
