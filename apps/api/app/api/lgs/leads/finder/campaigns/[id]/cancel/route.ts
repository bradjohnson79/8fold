/**
 * LGS Lead Finder: cancel a running campaign.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { leadFinderCampaigns } from "@/db/schema/directoryEngine";

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

    const cancellable = ["running", "cancel_requested"];
    if (!cancellable.includes(campaign.status ?? "")) {
      return NextResponse.json(
        { ok: false, error: `Cannot cancel campaign with status: ${campaign.status}` },
        { status: 409 }
      );
    }

    await db.update(leadFinderCampaigns)
      .set({ status: "cancel_requested" })
      .where(eq(leadFinderCampaigns.id, id));

    return NextResponse.json({ ok: true, data: { campaign_id: id, status: "cancel_requested" } });
  } catch (err) {
    console.error("LeadFinder cancel error:", err);
    return NextResponse.json({ ok: false, error: "cancel_failed" }, { status: 500 });
  }
}
