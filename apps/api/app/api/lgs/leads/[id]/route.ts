/**
 * LGS: Get a single lead with its latest outreach message.
 * PATCH: Update editable lead fields (business_name, trade, city, state, lead_name).
 */
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads, lgsOutreachQueue, outreachMessages } from "@/db/schema/directoryEngine";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    }

    const [lead] = await db
      .select()
      .from(contractorLeads)
      .where(eq(contractorLeads.id, id))
      .limit(1);

    if (!lead) {
      return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
    }

    // Get latest message
    const msgs = await db
      .select({
        id: outreachMessages.id,
        subject: outreachMessages.subject,
        body: outreachMessages.body,
        status: outreachMessages.status,
        createdAt: outreachMessages.createdAt,
        reviewedAt: outreachMessages.reviewedAt,
      })
      .from(outreachMessages)
      .where(eq(outreachMessages.leadId, id))
      .orderBy(desc(outreachMessages.createdAt))
      .limit(1);

    const latestMsg = msgs[0] ?? null;

    // Derive contact_status
    let contactStatus = "unsent";
    if (lead.signedUp) contactStatus = "converted";
    else if (lead.responseReceived) contactStatus = "replied";
    else if (lead.contactAttempts > 0) contactStatus = "sent";

    return NextResponse.json({
      ok: true,
      data: {
        id: lead.id,
        lead_number: lead.leadNumber,
        lead_name: lead.leadName,
        business_name: lead.businessName,
        email: lead.email,
        email_type: lead.emailType,
        website: lead.website,
        phone: lead.phone,
        trade: lead.trade,
        city: lead.city,
        state: lead.state,
        country: lead.country ?? null,
        source: lead.source,
        status: lead.status,
        contact_attempts: lead.contactAttempts,
        response_received: lead.responseReceived,
        signed_up: lead.signedUp,
        contact_status: contactStatus,
        verification_score: lead.verificationScore,
        verification_status: lead.verificationStatus,
        email_bounced: lead.emailBounced,
        discovery_method: lead.discoveryMethod,
        notes: lead.notes,
        primary_email_score: lead.primaryEmailScore ?? null,
        secondary_emails: lead.secondaryEmails ?? null,
        created_at: lead.createdAt?.toISOString() ?? null,
        updated_at: lead.updatedAt?.toISOString() ?? null,
        latest_message: latestMsg
          ? {
              id: latestMsg.id,
              subject: latestMsg.subject,
              body: latestMsg.body,
              status: latestMsg.status,
              created_at: latestMsg.createdAt?.toISOString() ?? null,
              reviewed_at: latestMsg.reviewedAt?.toISOString() ?? null,
            }
          : null,
      },
    });
  } catch (err) {
    console.error("LGS lead detail error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

/**
 * PATCH /api/lgs/leads/[id]
 * Update editable fields: business_name, trade, city, state, lead_name (contact name).
 * Protected fields (email, domain, verification_score, lead_number) are never modified here.
 */
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
      business_name?: string;
      trade?: string;
      city?: string;
      state?: string;
      lead_name?: string;
    };

    // Build update object — only include provided fields
    const updates: Partial<{
      businessName: string | null;
      trade: string | null;
      city: string | null;
      state: string | null;
      leadName: string | null;
      updatedAt: Date;
    }> = { updatedAt: new Date() };

    if ("business_name" in body) {
      updates.businessName = typeof body.business_name === "string" && body.business_name.trim()
        ? body.business_name.trim()
        : null;
    }
    if ("trade" in body) {
      updates.trade = typeof body.trade === "string" && body.trade.trim() ? body.trade.trim() : null;
    }
    if ("city" in body) {
      updates.city = typeof body.city === "string" && body.city.trim() ? body.city.trim() : null;
    }
    if ("state" in body) {
      updates.state = typeof body.state === "string" && body.state.trim() ? body.state.trim() : null;
    }
    if ("lead_name" in body) {
      updates.leadName = typeof body.lead_name === "string" && body.lead_name.trim()
        ? body.lead_name.trim()
        : null;
    }

    const [updated] = await db
      .update(contractorLeads)
      .set(updates)
      .where(eq(contractorLeads.id, id))
      .returning({
        id: contractorLeads.id,
        businessName: contractorLeads.businessName,
        trade: contractorLeads.trade,
        city: contractorLeads.city,
        state: contractorLeads.state,
        leadName: contractorLeads.leadName,
        updatedAt: contractorLeads.updatedAt,
      });

    if (!updated) {
      return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        business_name: updated.businessName,
        trade: updated.trade,
        city: updated.city,
        state: updated.state,
        lead_name: updated.leadName,
        updated_at: updated.updatedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    console.error("LGS lead patch error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
