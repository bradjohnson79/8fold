import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPosterEmailMessages, jobPosterLeads } from "@/db/schema/directoryEngine";

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status")?.trim() ?? "";
    const campaignId = req.nextUrl.searchParams.get("campaign_id")?.trim() ?? "";

    const conditions = [];
    if (status) conditions.push(eq(jobPosterEmailMessages.status, status));
    if (campaignId) conditions.push(eq(jobPosterEmailMessages.campaignId, campaignId));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: jobPosterEmailMessages.id,
        campaignId: jobPosterEmailMessages.campaignId,
        leadId: jobPosterEmailMessages.leadId,
        subject: jobPosterEmailMessages.subject,
        body: jobPosterEmailMessages.body,
        status: jobPosterEmailMessages.status,
        createdAt: jobPosterEmailMessages.createdAt,
        updatedAt: jobPosterEmailMessages.updatedAt,
        companyName: jobPosterLeads.companyName,
        contactName: jobPosterLeads.contactName,
        email: jobPosterLeads.email,
        category: jobPosterLeads.category,
        city: jobPosterLeads.city,
      })
      .from(jobPosterEmailMessages)
      .innerJoin(jobPosterLeads, eq(jobPosterEmailMessages.leadId, jobPosterLeads.id))
      .where(whereClause)
      .orderBy(desc(jobPosterEmailMessages.createdAt));

    return NextResponse.json({
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        campaign_id: row.campaignId,
        lead_id: row.leadId,
        subject: row.subject,
        body: row.body,
        status: row.status,
        created_at: row.createdAt?.toISOString() ?? null,
        updated_at: row.updatedAt?.toISOString() ?? null,
        company_name: row.companyName,
        contact_name: row.contactName,
        email: row.email,
        category: row.category,
        city: row.city,
      })),
    });
  } catch (error) {
    console.error("[Job Poster] List messages error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
