/**
 * LGS: List job poster leads with pagination and search.
 *
 * Query params:
 *   page                   (default: 1)
 *   page_size              (default: 50)
 *   search                 search across website, company, contact, email, category, city, state
 *   filter_archived        active (default) | archived | all
 *   filter_verification_status  valid|invalid|(any other = pending)
 *   filter_actionability   sendable|needs_attention|unusable
 *                          sendable:       archived=false, email present, email_verification_status='valid'
 *                          needs_attention:archived=false, email present, email_verification_status='pending', age<48h
 *                          unusable:       archived=false, no email OR invalid OR pending>48h
 *                          When set, overrides filter_archived (all three imply archived=false).
 */
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPosterLeads } from "@/db/schema/directoryEngine";
import { deriveLeadBinaryState, deriveLeadUiVerificationLabel } from "@/src/services/lgs/leadBinaryState";
import {
  deriveLegacyJobPosterProcessingStatus,
  getLgsSchemaCapabilities,
} from "@/src/services/lgs/lgsSchemaCapabilities";

export async function GET(req: NextRequest) {
  try {
    const schemaCapabilities = await getLgsSchemaCapabilities();
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(sp.get("page_size") ?? "50", 10)));
    const search = sp.get("search")?.trim() ?? "";
    const archivedFilter = sp.get("filter_archived")?.trim() ?? "active";
    const filterVerificationStatus = sp.get("filter_verification_status")?.trim() ?? "";
    const filterActionability = sp.get("filter_actionability")?.trim() ?? "active";

    const conditions: Array<any> = [];
    const verificationStatusNormalized = sql`coalesce(lower(trim(${jobPosterLeads.emailVerificationStatus})), 'pending')`;
    const processingStatusNormalized = schemaCapabilities.jobPosterProcessingStatus
      ? sql<string>`coalesce(lower(trim(${jobPosterLeads.processingStatus})), 'new')`
      : sql<string>`case
          when coalesce(${jobPosterLeads.needsEnrichment}, false) = true then 'enriching'
          when ${jobPosterLeads.email} is not null and trim(${jobPosterLeads.email}) <> '' then 'processed'
          else 'new'
        end`;
    const hasIdentitySql = sql`
      (
        (${jobPosterLeads.email} IS NOT NULL AND trim(${jobPosterLeads.email}) <> '')
        OR (${jobPosterLeads.contactName} IS NOT NULL AND trim(${jobPosterLeads.contactName}) <> '')
        OR (${jobPosterLeads.companyName} IS NOT NULL AND trim(${jobPosterLeads.companyName}) <> '')
      )
    `;
    const sendableSql = sql`
      ${jobPosterLeads.archived} = false
      AND ${jobPosterLeads.email} IS NOT NULL
      AND trim(${jobPosterLeads.email}) <> ''
      AND ${verificationStatusNormalized} in ('valid', 'verified')
    `;
    const processingSql = sql`
      ${jobPosterLeads.archived} = false
      AND ${hasIdentitySql}
      AND ${processingStatusNormalized} in ('new', 'enriching')
    `;
    const unusableSql = sql`
      ${jobPosterLeads.archived} = false
      AND ${hasIdentitySql}
      AND (
        ${verificationStatusNormalized} = 'invalid'
        OR (
          ${processingStatusNormalized} = 'processed'
          AND (
            ${jobPosterLeads.email} IS NULL
            OR trim(${jobPosterLeads.email}) = ''
            OR ${verificationStatusNormalized} not in ('valid', 'verified')
          )
        )
      )
    `;
    const activeSql = sql`
      ${jobPosterLeads.archived} = false
      AND ${hasIdentitySql}
    `;

    if (filterActionability === "active") {
      conditions.push(activeSql);
    } else if (filterActionability === "sendable") {
      conditions.push(sendableSql);
    } else if (filterActionability === "needs_attention") {
      conditions.push(processingSql);
    } else if (filterActionability === "unusable") {
      conditions.push(unusableSql);
    } else {
      if (archivedFilter === "active") {
        conditions.push(eq(jobPosterLeads.archived, false));
      } else if (archivedFilter === "archived") {
        conditions.push(eq(jobPosterLeads.archived, true));
      }
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
        )
      );
    }
    if (filterVerificationStatus && !["active", "sendable", "needs_attention", "unusable"].includes(filterActionability)) {
      if (filterVerificationStatus === "valid") {
        conditions.push(sql`${verificationStatusNormalized} in ('valid', 'verified')`);
      } else if (filterVerificationStatus === "invalid") {
        conditions.push(sql`${verificationStatusNormalized} = 'invalid'`);
      } else {
        conditions.push(sql`${verificationStatusNormalized} not in ('valid', 'verified', 'invalid')`);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Actionability counts — exact same SQL fragments as the filters above
    const enrichmentRes = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE ${activeSql}) AS active,
        count(*) FILTER (WHERE ${sendableSql}) AS sendable,
        count(*) FILTER (WHERE ${processingSql}) AS needs_attention,
        count(*) FILTER (WHERE ${unusableSql}) AS unusable
      FROM ${jobPosterLeads}
    `);
    const eRow = (enrichmentRes.rows?.[0] ?? {}) as Record<string, string>;
    const enrichment = {
      active: Number(eRow.active ?? 0),
      sendable: Number(eRow.sendable ?? 0),
      needs_attention: Number(eRow.needs_attention ?? 0),
      unusable: Number(eRow.unusable ?? 0),
    };

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobPosterLeads)
      .where(whereClause);

    const rows = await db
      .select({
        id: jobPosterLeads.id,
        campaignId: jobPosterLeads.campaignId,
        website: jobPosterLeads.website,
        companyName: jobPosterLeads.companyName,
        contactName: jobPosterLeads.contactName,
        email: jobPosterLeads.email,
        phone: jobPosterLeads.phone,
        category: jobPosterLeads.category,
        city: jobPosterLeads.city,
        state: jobPosterLeads.state,
        country: jobPosterLeads.country,
        source: jobPosterLeads.source,
        needsEnrichment: jobPosterLeads.needsEnrichment,
        assignmentStatus: jobPosterLeads.assignmentStatus,
        outreachStatus: jobPosterLeads.outreachStatus,
        emailVerificationStatus: jobPosterLeads.emailVerificationStatus,
        emailVerificationCheckedAt: jobPosterLeads.emailVerificationCheckedAt,
        emailVerificationScore: jobPosterLeads.emailVerificationScore,
        emailVerificationProvider: jobPosterLeads.emailVerificationProvider,
        processingStatus: processingStatusNormalized,
        status: jobPosterLeads.status,
        replyCount: jobPosterLeads.replyCount,
        archived: jobPosterLeads.archived,
        archivedAt: jobPosterLeads.archivedAt,
        archiveReason: jobPosterLeads.archiveReason,
        priorityScore: jobPosterLeads.priorityScore,
        leadScore: jobPosterLeads.leadScore,
        leadPriority: jobPosterLeads.leadPriority,
        responseReceived: jobPosterLeads.responseReceived,
        lastRepliedAt: jobPosterLeads.lastRepliedAt,
        createdAt: jobPosterLeads.createdAt,
        updatedAt: jobPosterLeads.updatedAt,
      })
      .from(jobPosterLeads)
      .where(whereClause)
      .orderBy(desc(jobPosterLeads.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    console.log("[LGS] Job poster leads list", {
      filterActionability,
      archivedFilter,
      filterVerificationStatus,
      search: search || null,
      total: Number(count ?? 0),
      page,
      pageSize,
      schemaCapabilities,
    });

    return NextResponse.json({
      ok: true,
      total: Number(count ?? 0),
      page,
      page_size: pageSize,
      total_pages: Math.ceil(Number(count ?? 0) / pageSize),
      enrichment,
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
          processing_status: schemaCapabilities.jobPosterProcessingStatus
            ? row.processingStatus
            : deriveLegacyJobPosterProcessingStatus({
                email: row.email,
                needsEnrichment: row.needsEnrichment,
              }),
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
