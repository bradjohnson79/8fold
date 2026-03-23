/**
 * LGS Lead Finder: campaign detail with jobs + paginated domains.
 */
import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  jobPosterLeads,
  leadFinderCampaigns,
  leadFinderJobs,
  leadFinderDomains,
} from "@/db/schema/directoryEngine";
import { getAutoAssignedLeadCounts } from "@/src/services/lgs/autoAssignmentService";
import { getCampaignOutreachMetrics } from "@/src/services/lgs/outreachAutomationService";
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

    const counts = await getAutoAssignedLeadCounts([campaign.id]);
    const outreach = await getCampaignOutreachMetrics([campaign.id]);
    const topPerformingLeads = campaign.campaignType === "jobs"
      ? await db
        .select({
          id: jobPosterLeads.id,
          name: jobPosterLeads.companyName,
          email: jobPosterLeads.email,
          replyCount: jobPosterLeads.replyCount,
          priorityScore: jobPosterLeads.priorityScore,
          lastRepliedAt: jobPosterLeads.lastRepliedAt,
        })
        .from(jobPosterLeads)
        .where(eq(jobPosterLeads.campaignId, campaign.id))
        .orderBy(desc(jobPosterLeads.replyCount), desc(jobPosterLeads.priorityScore), desc(jobPosterLeads.lastRepliedAt))
        .limit(10)
      : await db
        .select({
          id: contractorLeads.id,
          name: contractorLeads.businessName,
          email: contractorLeads.email,
          replyCount: contractorLeads.replyCount,
          priorityScore: contractorLeads.priorityScore,
          lastRepliedAt: contractorLeads.lastRepliedAt,
        })
        .from(contractorLeads)
        .where(eq(contractorLeads.campaignId, campaign.id))
        .orderBy(desc(contractorLeads.replyCount), desc(contractorLeads.priorityScore), desc(contractorLeads.lastRepliedAt))
        .limit(10);

    return NextResponse.json({
      ok: true,
      data: {
        campaign: {
          ...serializeLeadFinderCampaign(campaign),
          auto_assigned_leads_count: counts[campaign.id] ?? 0,
          generated_count: outreach[campaign.id]?.generated ?? 0,
          approved_count: outreach[campaign.id]?.approved ?? 0,
          queued_count: outreach[campaign.id]?.queued ?? 0,
          sent_count_live: outreach[campaign.id]?.sent ?? 0,
          failed_count: outreach[campaign.id]?.failed ?? 0,
        },
        jobs: jobs.map((job) => serializeLeadFinderJob(job)),
        domains: domains.map((domain) => serializeLeadFinderDomain(domain)),
        top_performing_leads: topPerformingLeads.map((lead) => ({
          id: lead.id,
          name: lead.name ?? "—",
          email: lead.email ?? null,
          reply_count: lead.replyCount ?? 0,
          priority_score: lead.priorityScore ?? 0,
          last_replied_at: lead.lastRepliedAt?.toISOString() ?? null,
        })),
        page,
        page_size: pageSize,
      },
    });
  } catch (err) {
    console.error("LeadFinder campaign GET error:", err);
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 500 });
  }
}
