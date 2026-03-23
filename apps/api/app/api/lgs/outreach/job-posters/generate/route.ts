import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPosterLeads } from "@/db/schema/directoryEngine";
import { generateJobPosterMessageForLead } from "@/src/services/lgs/outreachAutomationService";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { campaign_id?: string };
    const campaignId = body.campaign_id?.trim();
    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "campaign_id_required" }, { status: 400 });
    }

    const leads = await db
      .select({ id: jobPosterLeads.id })
      .from(jobPosterLeads)
      .where(eq(jobPosterLeads.campaignId, campaignId));

    if (leads.length === 0) {
      return NextResponse.json({ ok: true, data: { generated: 0, skipped: 0 } });
    }

    let generated = 0;
    let skipped = 0;
    for (const lead of leads) {
      const result = await generateJobPosterMessageForLead(lead.id);
      if (result.skipped) skipped++;
      else if (result.ok) generated++;
    }

    console.log("[Job Poster] Generated messages", {
      campaignId,
      generated,
      skipped,
    });

    return NextResponse.json({
      ok: true,
      data: {
        generated,
        skipped,
      },
    });
  } catch (error) {
    console.error("[Job Poster] Generate messages error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
