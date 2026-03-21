/**
 * LGS Lead Finder: campaign detail with jobs + paginated domains.
 */
import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  leadFinderCampaigns,
  leadFinderJobs,
  leadFinderDomains,
} from "@/db/schema/directoryEngine";
import {
  serializeLeadFinderCampaign,
  serializeLeadFinderDomain,
  serializeLeadFinderJob,
} from "@/src/services/lgs/leadFinderApiSerializers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = 100;

    const [campaign] = await db
      .select()
      .from(leadFinderCampaigns)
      .where(eq(leadFinderCampaigns.id, id))
      .limit(1);

    if (!campaign) {
      return NextResponse.json({ ok: false, error: "campaign_not_found" }, { status: 404 });
    }

    const jobs = await db
      .select()
      .from(leadFinderJobs)
      .where(eq(leadFinderJobs.campaignId, id))
      .orderBy(desc(leadFinderJobs.createdAt));

    const domains = await db
      .select()
      .from(leadFinderDomains)
      .where(eq(leadFinderDomains.campaignId, id))
      .orderBy(desc(leadFinderDomains.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return NextResponse.json({
      ok: true,
      data: {
        campaign: serializeLeadFinderCampaign(campaign),
        jobs: jobs.map((job) => serializeLeadFinderJob(job)),
        domains: domains.map((domain) => serializeLeadFinderDomain(domain)),
        page,
        page_size: pageSize,
      },
    });
  } catch (err) {
    console.error("LeadFinder campaign GET error:", err);
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 500 });
  }
}
