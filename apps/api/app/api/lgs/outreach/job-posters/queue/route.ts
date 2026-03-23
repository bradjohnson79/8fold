import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  jobPosterEmailMessages,
  jobPosterEmailQueue,
  jobPosterLeads,
} from "@/db/schema/directoryEngine";
import { queueApprovedJobPosterMessages } from "@/src/services/lgs/jobPosterOutreachService";

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status")?.trim() ?? "";
    const campaignId = req.nextUrl.searchParams.get("campaign_id")?.trim() ?? "";

    const summary = await db
      .select({
        pending: sql<number>`count(*) filter (where ${jobPosterEmailQueue.status} = 'pending')::int`,
        sent: sql<number>`count(*) filter (where ${jobPosterEmailQueue.status} = 'sent')::int`,
        failed: sql<number>`count(*) filter (where ${jobPosterEmailQueue.status} = 'failed')::int`,
      })
      .from(jobPosterEmailQueue);

    const conditions = [];
    if (status) conditions.push(eq(jobPosterEmailQueue.status, status));
    if (campaignId) conditions.push(eq(jobPosterEmailMessages.campaignId, campaignId));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: jobPosterEmailQueue.id,
        messageId: jobPosterEmailQueue.messageId,
        senderEmail: jobPosterEmailQueue.senderEmail,
        scheduledAt: jobPosterEmailQueue.scheduledAt,
        sentAt: jobPosterEmailQueue.sentAt,
        status: jobPosterEmailQueue.status,
        retryCount: jobPosterEmailQueue.retryCount,
        errorMessage: jobPosterEmailQueue.errorMessage,
        createdAt: jobPosterEmailQueue.createdAt,
        campaignId: jobPosterEmailMessages.campaignId,
        subject: jobPosterEmailMessages.subject,
        leadId: jobPosterEmailMessages.leadId,
        companyName: jobPosterLeads.companyName,
        contactName: jobPosterLeads.contactName,
        email: jobPosterLeads.email,
        category: jobPosterLeads.category,
        city: jobPosterLeads.city,
      })
      .from(jobPosterEmailQueue)
      .innerJoin(jobPosterEmailMessages, eq(jobPosterEmailQueue.messageId, jobPosterEmailMessages.id))
      .innerJoin(jobPosterLeads, eq(jobPosterEmailMessages.leadId, jobPosterLeads.id))
      .where(whereClause)
      .orderBy(asc(jobPosterEmailQueue.createdAt));

    return NextResponse.json({
      ok: true,
      summary: summary[0] ?? { pending: 0, sent: 0, failed: 0 },
      data: rows.map((row) => ({
        id: row.id,
        message_id: row.messageId,
        campaign_id: row.campaignId,
        lead_id: row.leadId,
        sender_email: row.senderEmail,
        scheduled_at: row.scheduledAt?.toISOString() ?? null,
        sent_at: row.sentAt?.toISOString() ?? null,
        status: row.status,
        retry_count: row.retryCount ?? 0,
        error_message: row.errorMessage,
        created_at: row.createdAt?.toISOString() ?? null,
        subject: row.subject,
        company_name: row.companyName,
        contact_name: row.contactName,
        email: row.email,
        category: row.category,
        city: row.city,
      })),
    });
  } catch (error) {
    console.error("[Job Poster] Queue list error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { campaign_id?: string };
    const campaignId = body.campaign_id?.trim();
    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "campaign_id_required" }, { status: 400 });
    }

    const result = await queueApprovedJobPosterMessages(campaignId);
    console.log("[Job Poster] Queued approved messages", { campaignId, ...result });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    console.error("[Job Poster] Queue create error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
