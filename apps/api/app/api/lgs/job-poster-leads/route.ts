/**
 * LGS: List job poster leads with pagination and search.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPosterLeads } from "@/db/schema/directoryEngine";
import { deriveLeadBinaryState, deriveLeadUiVerificationLabel } from "@/src/services/lgs/leadBinaryState";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(sp.get("page_size") ?? "50", 10)));
    const search = sp.get("search")?.trim() ?? "";
    const archivedFilter = sp.get("filter_archived")?.trim() ?? "active";
    const filterVerificationStatus = sp.get("filter_verification_status")?.trim() ?? "";

    const conditions: Array<ReturnType<typeof eq>> = [];
    if (archivedFilter === "active") {
      conditions.push(eq(jobPosterLeads.archived, false) as ReturnType<typeof eq>);
    } else if (archivedFilter === "archived") {
      conditions.push(eq(jobPosterLeads.archived, true) as ReturnType<typeof eq>);
    }

    if (search) {
      conditions.push(
        or(
          ilike(jobPosterLeads.website, `%${search}%`),
          ilike(jobPosterLeads.companyName, `%${search}%`),
          ilike(jobPosterLeads.contactName, `%${search}%`),
          ilike(jobPosterLeads.email, `%${search}%`),
          ilike(jobPosterLeads.category, `%${search}%`),
          ilike(jobPosterLeads.city, `%${search}%`),
          ilike(jobPosterLeads.state, `%${search}%`)
        ) as ReturnType<typeof eq>
      );
    }
    if (filterVerificationStatus) {
      if (filterVerificationStatus === "valid") {
        conditions.push(sql`coalesce(lower(trim(${jobPosterLeads.emailVerificationStatus})), 'pending') in ('valid', 'verified')` as ReturnType<typeof eq>);
      } else if (filterVerificationStatus === "invalid") {
        conditions.push(sql`coalesce(lower(trim(${jobPosterLeads.emailVerificationStatus})), 'pending') = 'invalid'` as ReturnType<typeof eq>);
      } else {
        conditions.push(sql`coalesce(lower(trim(${jobPosterLeads.emailVerificationStatus})), 'pending') not in ('valid', 'verified', 'invalid')` as ReturnType<typeof eq>);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobPosterLeads)
      .where(whereClause);

    const rows = await db
      .select()
      .from(jobPosterLeads)
      .where(whereClause)
      .orderBy(desc(jobPosterLeads.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return NextResponse.json({
      ok: true,
      total: Number(count ?? 0),
      page,
      page_size: pageSize,
      total_pages: Math.ceil(Number(count ?? 0) / pageSize),
      data: rows.map((row) => {
        const finalStatus = deriveLeadBinaryState({
          archived: row.archived,
          emailVerificationStatus: row.emailVerificationStatus,
          priorityScore: row.priorityScore,
          needsEnrichment: row.needsEnrichment,
          emailVerificationCheckedAt: row.emailVerificationCheckedAt,
          createdAt: row.createdAt,
        });
        const uiVerificationStatus = deriveLeadUiVerificationLabel({
          archived: row.archived,
          emailVerificationStatus: row.emailVerificationStatus,
          priorityScore: row.priorityScore,
          needsEnrichment: row.needsEnrichment,
          emailVerificationCheckedAt: row.emailVerificationCheckedAt,
          createdAt: row.createdAt,
        });

        return {
          id: row.id,
          campaign_id: row.campaignId,
          website: row.website,
          company_name: row.companyName,
          contact_name: row.contactName,
          email: row.email,
          phone: row.phone,
          category: row.category,
          city: row.city,
          state: row.state,
          country: row.country,
          source: row.source,
          needs_enrichment: row.needsEnrichment,
          assignment_status: row.assignmentStatus,
          outreach_status: row.outreachStatus,
          email_verification_status: row.emailVerificationStatus,
          email_verification_checked_at: row.emailVerificationCheckedAt?.toISOString() ?? null,
          email_verification_score: row.emailVerificationScore,
          email_verification_provider: row.emailVerificationProvider,
          ui_verification_status: uiVerificationStatus,
          final_status: finalStatus,
          ready_for_outreach: finalStatus === "ready",
          status: row.status,
          reply_count: row.replyCount ?? 0,
          archived: row.archived,
          archived_at: row.archivedAt?.toISOString() ?? null,
          archive_reason: row.archiveReason,
          priority_score: row.priorityScore ?? 0,
          lead_score: row.leadScore ?? 0,
          lead_priority: row.leadPriority ?? "medium",
          response_received: row.responseReceived,
          last_replied_at: row.lastRepliedAt?.toISOString() ?? null,
          created_at: row.createdAt?.toISOString() ?? null,
          updated_at: row.updatedAt?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) {
    console.error("LGS job poster leads error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
