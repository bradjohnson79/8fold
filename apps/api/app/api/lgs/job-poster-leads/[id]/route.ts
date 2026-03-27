import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  jobPosterEmailMessages,
  jobPosterEmailQueue,
  jobPosterLeads,
} from "@/db/schema/directoryEngine";
import {
  getLgsSchemaCapabilities,
} from "@/src/services/lgs/lgsSchemaCapabilities";

function normalizeVerificationStatus(status: string | null | undefined): "pending" | "valid" | "invalid" {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "valid" || normalized === "verified") return "valid";
  if (normalized === "invalid") return "invalid";
  return "pending";
}

function deriveContactStatus(row: {
  contactAttempts: number;
  responseReceived: boolean;
  signedUp: boolean;
}): string {
  if (row.signedUp) return "converted";
  if (row.responseReceived) return "replied";
  if ((row.contactAttempts ?? 0) > 0) return "sent";
  return "unsent";
}

function deriveMessageStatus(message: {
  status: string | null;
  queueStatus: string | null;
  queueSentAt: Date | null;
} | null): "none" | "ready" | "approved" | "queued" | "sent" {
  if (!message) return "none";
  if (message.queueSentAt || message.queueStatus === "sent" || message.status === "sent") return "sent";
  if (message.queueStatus === "pending" || message.status === "queued") return "queued";
  if (message.status === "approved") return "approved";
  if (message.status === "pending_review" || message.status === "draft") return "ready";
  return "none";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const schemaCapabilities = await getLgsSchemaCapabilities();
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    }

    const processingStatusNormalized = schemaCapabilities.jobPosterProcessingStatus
      ? sql<string>`coalesce(lower(trim(${jobPosterLeads.processingStatus})), 'new')`
      : sql<string>`case
          when coalesce(${jobPosterLeads.needsEnrichment}, false) = true then 'enriching'
          when ${jobPosterLeads.email} is not null and trim(${jobPosterLeads.email}) <> '' then 'processed'
          else 'new'
        end`;

    const [lead] = await db
      .select({
        id: jobPosterLeads.id,
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
        status: jobPosterLeads.status,
        processingStatus: processingStatusNormalized,
        assignmentStatus: jobPosterLeads.assignmentStatus,
        outreachStatus: jobPosterLeads.outreachStatus,
        contactAttempts: jobPosterLeads.contactAttempts,
        responseReceived: jobPosterLeads.responseReceived,
        signedUp: jobPosterLeads.signedUp,
        emailVerificationStatus: jobPosterLeads.emailVerificationStatus,
        createdAt: jobPosterLeads.createdAt,
        updatedAt: jobPosterLeads.updatedAt,
      })
      .from(jobPosterLeads)
      .where(eq(jobPosterLeads.id, id))
      .limit(1);

    if (!lead) {
      return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
    }

    const [message] = await db
      .select({
        id: jobPosterEmailMessages.id,
        subject: jobPosterEmailMessages.subject,
        body: jobPosterEmailMessages.body,
        status: jobPosterEmailMessages.status,
        createdAt: jobPosterEmailMessages.createdAt,
        reviewedAt: jobPosterEmailMessages.reviewedAt,
        queueStatus: jobPosterEmailQueue.status,
        queueSentAt: jobPosterEmailQueue.sentAt,
      })
      .from(jobPosterEmailMessages)
      .leftJoin(jobPosterEmailQueue, eq(jobPosterEmailQueue.messageId, jobPosterEmailMessages.id))
      .where(eq(jobPosterEmailMessages.leadId, id))
      .orderBy(desc(jobPosterEmailMessages.createdAt))
      .limit(1);

    const latestMessageStatus = deriveMessageStatus(message ?? null);

    return NextResponse.json({
      ok: true,
      data: {
        id: lead.id,
        website: lead.website,
        company_name: lead.companyName,
        contact_name: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        category: lead.category,
        city: lead.city,
        state: lead.state,
        country: lead.country,
        source: lead.source,
        status: lead.status,
        processing_status: lead.processingStatus,
        assignment_status: lead.assignmentStatus,
        outreach_status: lead.outreachStatus,
        contact_status: deriveContactStatus(lead),
        contact_attempts: lead.contactAttempts,
        response_received: lead.responseReceived,
        signed_up: lead.signedUp,
        verification_status: normalizeVerificationStatus(lead.emailVerificationStatus),
        email_bounced: null,
        notes: null,
        created_at: lead.createdAt?.toISOString() ?? null,
        updated_at: lead.updatedAt?.toISOString() ?? null,
        latest_message: message
          ? {
              id: message.id,
              subject: message.subject,
              body: message.body,
              status: latestMessageStatus,
              created_at: message.createdAt?.toISOString() ?? null,
              reviewed_at: message.reviewedAt?.toISOString() ?? null,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("[Job Poster] Lead detail error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      website?: string;
      company_name?: string;
      contact_name?: string;
      category?: string;
      city?: string;
      state?: string;
    };

    const updates: Partial<{
      website: string;
      companyName: string | null;
      contactName: string | null;
      category: string;
      city: string | null;
      state: string | null;
      updatedAt: Date;
    }> = { updatedAt: new Date() };

    if ("website" in body && typeof body.website === "string" && body.website.trim()) {
      updates.website = body.website.trim();
    }
    if ("company_name" in body) {
      updates.companyName = typeof body.company_name === "string" && body.company_name.trim()
        ? body.company_name.trim()
        : null;
    }
    if ("contact_name" in body) {
      updates.contactName = typeof body.contact_name === "string" && body.contact_name.trim()
        ? body.contact_name.trim()
        : null;
    }
    if ("category" in body && typeof body.category === "string" && body.category.trim()) {
      updates.category = body.category.trim();
    }
    if ("city" in body) {
      updates.city = typeof body.city === "string" && body.city.trim() ? body.city.trim() : null;
    }
    if ("state" in body) {
      updates.state = typeof body.state === "string" && body.state.trim() ? body.state.trim() : null;
    }

    const [updated] = await db
      .update(jobPosterLeads)
      .set(updates)
      .where(eq(jobPosterLeads.id, id))
      .returning({
        id: jobPosterLeads.id,
        website: jobPosterLeads.website,
        companyName: jobPosterLeads.companyName,
        contactName: jobPosterLeads.contactName,
        category: jobPosterLeads.category,
        city: jobPosterLeads.city,
        state: jobPosterLeads.state,
        updatedAt: jobPosterLeads.updatedAt,
      });

    if (!updated) {
      return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        website: updated.website,
        company_name: updated.companyName,
        contact_name: updated.contactName,
        category: updated.category,
        city: updated.city,
        state: updated.state,
        updated_at: updated.updatedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error("[Job Poster] Lead patch error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
