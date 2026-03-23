/**
 * LGS: List contractor leads with pagination, filters, search, and derived statuses.
 *
 * Query params:
 *   page                   (default: 1)
 *   page_size              (default: 100)
 *   search                 multi-term search across name, email, business, city, state, country, trade
 *   filter_source          filter by source value
 *   filter_contact_status  unsent|sent|replied|converted
 *   filter_message_status  none|ready|approved|sent
 *   filter_verification_status pending|valid|invalid
 *   filter_archived        active (default) | archived | all
 */
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads, lgsOutreachQueue, outreachMessages } from "@/db/schema/directoryEngine";
import { deriveLeadBinaryState, deriveLeadUiVerificationLabel } from "@/src/services/lgs/leadBinaryState";

const STATE_ABBREVS: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
  alberta: "AB", "british columbia": "BC", manitoba: "MB", "new brunswick": "NB",
  "newfoundland and labrador": "NL", "nova scotia": "NS", ontario: "ON",
  "prince edward island": "PE", quebec: "QC", saskatchewan: "SK",
};

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "US", "united states": "US", america: "US",
  canada: "CA", can: "CA",
};

function normalizeSearchTerm(term: string): string[] {
  const lower = term.toLowerCase();
  const variants = [lower];
  if (STATE_ABBREVS[lower]) variants.push(STATE_ABBREVS[lower]);
  if (COUNTRY_ALIASES[lower]) variants.push(COUNTRY_ALIASES[lower]);
  return variants;
}

function deriveContactStatus(row: {
  contact_attempts: number;
  response_received: boolean;
  signed_up: boolean;
}): string {
  if (row.signed_up) return "converted";
  if (row.response_received) return "replied";
  if (row.contact_attempts > 0) return "sent";
  return "unsent";
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(sp.get("page_size") ?? "100", 10)));
    const search = sp.get("search")?.trim() ?? null;
    const filterSource = sp.get("filter_source")?.trim() ?? null;
    const filterContactStatus = sp.get("filter_contact_status")?.trim() ?? null;
    const filterMessageStatus = sp.get("filter_message_status")?.trim() ?? null;
    const filterVerificationStatus = sp.get("filter_verification_status")?.trim() ?? null;
    // active (default) = hide archived; archived = show only archived; all = show everything
    const filterArchived = sp.get("filter_archived")?.trim() ?? "active";

    // Build WHERE conditions
    const conditions: ReturnType<typeof ilike>[] = [];

    // Archive filter — always applied first
    if (filterArchived === "active") {
      conditions.push(eq(contractorLeads.archived, false) as ReturnType<typeof ilike>);
    } else if (filterArchived === "archived") {
      conditions.push(eq(contractorLeads.archived, true) as ReturnType<typeof ilike>);
    }
    // "all" → no archive filter

    if (search) {
      const terms = search.trim().split(/\s+/).filter(Boolean);
      for (const rawTerm of terms) {
        const variants = normalizeSearchTerm(rawTerm);
        const termConditions = variants.flatMap((v) => [
          ilike(contractorLeads.email, `%${v}%`),
          ilike(contractorLeads.leadName, `%${v}%`),
          ilike(contractorLeads.businessName, `%${v}%`),
          ilike(contractorLeads.city, `%${v}%`),
          ilike(contractorLeads.state, `%${v}%`),
          ilike(contractorLeads.country, `%${v}%`),
          ilike(contractorLeads.trade, `%${v}%`),
        ]);
        conditions.push(or(...termConditions)!);
      }
    }

    if (filterSource) {
      conditions.push(sql`${contractorLeads.source} = ${filterSource}` as ReturnType<typeof ilike>);
    }
    if (filterVerificationStatus) {
      if (filterVerificationStatus === "valid") {
        conditions.push(sql`coalesce(lower(trim(${contractorLeads.emailVerificationStatus})), 'pending') in ('valid', 'verified')` as ReturnType<typeof ilike>);
      } else if (filterVerificationStatus === "invalid") {
        conditions.push(sql`coalesce(lower(trim(${contractorLeads.emailVerificationStatus})), 'pending') = 'invalid'` as ReturnType<typeof ilike>);
      } else {
        conditions.push(sql`coalesce(lower(trim(${contractorLeads.emailVerificationStatus})), 'pending') not in ('valid', 'verified', 'invalid')` as ReturnType<typeof ilike>);
      }
    }

    // contact_status is derived; filter in SQL using equivalent logic
    if (filterContactStatus) {
      if (filterContactStatus === "converted") {
        conditions.push(sql`${contractorLeads.signedUp} = true` as ReturnType<typeof ilike>);
      } else if (filterContactStatus === "replied") {
        conditions.push(sql`${contractorLeads.responseReceived} = true and ${contractorLeads.signedUp} = false` as ReturnType<typeof ilike>);
      } else if (filterContactStatus === "sent") {
        conditions.push(sql`${contractorLeads.contactAttempts} > 0 and ${contractorLeads.responseReceived} = false and ${contractorLeads.signedUp} = false` as ReturnType<typeof ilike>);
      } else if (filterContactStatus === "unsent") {
        conditions.push(sql`${contractorLeads.contactAttempts} = 0` as ReturnType<typeof ilike>);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count
    const countRes = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(contractorLeads)
      .where(whereClause);
    const total = countRes[0]?.c ?? 0;

    // Enrichment summary — always computed globally (ignores filters) for the status bar
    const enrichmentRes = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE email_verification_status = 'pending' OR email_verification_status IS NULL) AS pending,
        count(*) FILTER (WHERE lower(coalesce(email_verification_status, 'pending')) IN ('valid', 'verified')) AS valid,
        count(*) FILTER (WHERE archived = true) AS archived_count,
        count(*) AS total_all
      FROM directory_engine.contractor_leads
    `);
    const eRow = (enrichmentRes.rows?.[0] ?? {}) as Record<string, string>;
    const enrichment = {
      pending: Number(eRow.pending ?? 0),
      valid: Number(eRow.valid ?? 0),
      archived: Number(eRow.archived_count ?? 0),
      total: Number(eRow.total_all ?? 0),
    };
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    // Fetch page of leads
    const rows = await db
      .select({
        id: contractorLeads.id,
        lead_number: contractorLeads.leadNumber,
        lead_name: contractorLeads.leadName,
        business_name: contractorLeads.businessName,
        email: contractorLeads.email,
        email_type: contractorLeads.emailType,
        trade: contractorLeads.trade,
        city: contractorLeads.city,
        state: contractorLeads.state,
        country: contractorLeads.country,
        source: contractorLeads.source,
        needs_enrichment: contractorLeads.needsEnrichment,
        assignment_status: contractorLeads.assignmentStatus,
        outreach_status: contractorLeads.outreachStatus,
        email_verification_status: contractorLeads.emailVerificationStatus,
        email_verification_checked_at: contractorLeads.emailVerificationCheckedAt,
        email_verification_score: contractorLeads.emailVerificationScore,
        email_verification_provider: contractorLeads.emailVerificationProvider,
        contact_attempts: contractorLeads.contactAttempts,
        response_received: contractorLeads.responseReceived,
        signed_up: contractorLeads.signedUp,
        reply_count: contractorLeads.replyCount,
        created_at: contractorLeads.createdAt,
        verification_score: contractorLeads.verificationScore,
        verification_status: contractorLeads.verificationStatus,
        verification_source: contractorLeads.verificationSource,
        domain_reputation: contractorLeads.domainReputation,
        email_bounced: contractorLeads.emailBounced,
        website: contractorLeads.website,
        archived: contractorLeads.archived,
        archived_at: contractorLeads.archivedAt,
        archive_reason: contractorLeads.archiveReason,
        // Brain fields
        priority_score: contractorLeads.priorityScore,
        lead_score: contractorLeads.leadScore,
        lead_priority: contractorLeads.leadPriority,
        priority_source: contractorLeads.prioritySource,
        outreach_stage: contractorLeads.outreachStage,
        followup_count: contractorLeads.followupCount,
        next_followup_at: contractorLeads.nextFollowupAt,
        last_contacted_at: contractorLeads.lastContactedAt,
        last_replied_at: contractorLeads.lastRepliedAt,
        last_message_type_sent: contractorLeads.lastMessageTypeSent,
        score_dirty: contractorLeads.scoreDirty,
      })
      .from(contractorLeads)
      .where(whereClause)
      .orderBy(desc(contractorLeads.createdAt))
      .limit(pageSize)
      .offset(offset);

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        total,
        page,
        page_size: pageSize,
        total_pages: totalPages,
        enrichment,
        data: [],
      });
    }

    // Fetch latest outreach message per lead using Drizzle ORM (avoids raw SQL array issues)
    const leadIds = rows.map((r) => r.id);
    const allMessages = await db
      .select({
        lead_id: outreachMessages.leadId,
        message_id: outreachMessages.id,
        latest_message_subject: outreachMessages.subject,
        latest_message_body: outreachMessages.body,
        message_status: outreachMessages.status,
        created_at: outreachMessages.createdAt,
        queue_send_status: lgsOutreachQueue.sendStatus,
        queue_sent_at: lgsOutreachQueue.sentAt,
      })
      .from(outreachMessages)
      .leftJoin(lgsOutreachQueue, sql`${lgsOutreachQueue.outreachMessageId} = ${outreachMessages.id}`)
      .where(inArray(outreachMessages.leadId, leadIds))
      .orderBy(desc(outreachMessages.createdAt));

    // Keep only the latest message per lead (application-level DISTINCT ON)
    type MsgRow = {
      lead_id: string;
      message_id: string;
      latest_message_subject: string | null;
      latest_message_body: string | null;
      message_status: string | null;
      queue_send_status: string | null;
      queue_sent_at: Date | null;
    };
    const msgMap = new Map<string, MsgRow>();
    for (const msg of allMessages) {
      if (!msgMap.has(msg.lead_id)) {
        msgMap.set(msg.lead_id, {
          lead_id: msg.lead_id,
          message_id: msg.message_id,
          latest_message_subject: msg.latest_message_subject,
          latest_message_body: msg.latest_message_body,
          message_status: msg.message_status,
          queue_send_status: msg.queue_send_status,
          queue_sent_at: msg.queue_sent_at,
        });
      }
    }

    function deriveMessageStatus(msg: MsgRow | undefined): string {
      if (!msg) return "none";
      if (msg.queue_sent_at) return "sent";
      if (msg.message_status === "approved") return "approved";
      if (msg.message_status === "pending_review") return "ready";
      return "none";
    }

    const data = rows.map((r) => {
      const msg = msgMap.get(r.id);
      const contactStatus = deriveContactStatus({
        contact_attempts: r.contact_attempts,
        response_received: r.response_received,
        signed_up: r.signed_up,
      });
      const messageStatus = deriveMessageStatus(msg);
      const finalStatus = deriveLeadBinaryState({
        archived: r.archived,
        emailVerificationStatus: r.email_verification_status,
        priorityScore: r.priority_score,
        needsEnrichment: r.needs_enrichment,
        emailVerificationCheckedAt: r.email_verification_checked_at,
        createdAt: r.created_at,
      });
      const uiVerificationStatus = deriveLeadUiVerificationLabel({
        archived: r.archived,
        emailVerificationStatus: r.email_verification_status,
        priorityScore: r.priority_score,
        needsEnrichment: r.needs_enrichment,
        emailVerificationCheckedAt: r.email_verification_checked_at,
        createdAt: r.created_at,
      });

      return {
        id: r.id,
        lead_number: r.lead_number,
        lead_name: r.lead_name,
        business_name: r.business_name,
        email: r.email,
        email_type: r.email_type,
        trade: r.trade,
        city: r.city,
        state: r.state,
        country: r.country,
        source: r.source,
        needs_enrichment: r.needs_enrichment,
        assignment_status: r.assignment_status,
        outreach_status: r.outreach_status,
        email_verification_status: r.email_verification_status,
        email_verification_checked_at: r.email_verification_checked_at?.toISOString() ?? null,
        email_verification_score: r.email_verification_score,
        email_verification_provider: r.email_verification_provider,
        contact_attempts: r.contact_attempts,
        response_received: r.response_received,
        signed_up: r.signed_up,
        reply_count: r.reply_count ?? 0,
        created_at: r.created_at?.toISOString() ?? null,
        verification_score: r.verification_score,
        verification_status: r.verification_status,
        verification_source: r.verification_source,
        domain_reputation: r.domain_reputation,
        email_bounced: r.email_bounced,
        website: r.website,
        archived: r.archived,
        archived_at: r.archived_at?.toISOString() ?? null,
        archive_reason: r.archive_reason,
        final_status: finalStatus,
        ready_for_outreach: finalStatus === "ready",
        ui_verification_status: uiVerificationStatus,
        contact_status: contactStatus,
        message_status: messageStatus,
        latest_message_id: msg?.message_id ?? null,
        latest_message_subject: msg?.latest_message_subject ?? null,
        latest_message_body: msg?.latest_message_body ?? null,
        // Brain fields
        priority_score: r.priority_score ?? 0,
        lead_score: r.lead_score ?? 0,
        lead_priority: r.lead_priority ?? "medium",
        priority_source: r.priority_source ?? "auto",
        outreach_stage: r.outreach_stage ?? "not_contacted",
        followup_count: r.followup_count ?? 0,
        next_followup_at: r.next_followup_at?.toISOString() ?? null,
        last_contacted_at: r.last_contacted_at?.toISOString() ?? null,
        last_replied_at: r.last_replied_at?.toISOString() ?? null,
        last_message_type_sent: r.last_message_type_sent ?? null,
        score_dirty: r.score_dirty ?? false,
      };
    });

    // Apply post-query filter for message_status (derived field)
    const filtered =
      filterMessageStatus
        ? data.filter((d) => d.message_status === filterMessageStatus)
        : data;

    return NextResponse.json({
      ok: true,
      total: filterMessageStatus ? filtered.length : total,
      page,
      page_size: pageSize,
      total_pages: filterMessageStatus ? Math.ceil(filtered.length / pageSize) : totalPages,
      enrichment,
      data: filtered,
    });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "42P01") return NextResponse.json({ ok: true, total: 0, page: 1, page_size: 100, total_pages: 0, data: [] });
    console.error("LGS leads error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
