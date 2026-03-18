/**
 * LGS: Generate outreach message(s) for lead(s) via GPT-5 Nano.
 * Accepts single: { lead_id: string }
 * Accepts bulk:   { lead_ids: string[] }
 *
 * Brain integration: passes lead_priority, followup_count, last_message_type_sent
 * to determineMessageType(); saves message_type + message_version_hash;
 * updates lead's outreach_stage = 'message_ready' and last_message_type_sent.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads, outreachMessages } from "@/db/schema/directoryEngine";
import { generateOutreachEmail } from "@/src/services/lgs/outreachEmailGenerationService";

async function generateForLead(
  leadId: string,
  existingHashes: Set<string>,
  skipIfExists = true
): Promise<{ ok: boolean; id?: string; error?: string; skipped?: boolean }> {
  const [lead] = await db
    .select()
    .from(contractorLeads)
    .where(eq(contractorLeads.id, leadId))
    .limit(1);

  if (!lead) return { ok: false, error: "lead_not_found" };

  // Skip if a message already exists for this lead (prevents accidental regeneration)
  if (skipIfExists) {
    const [existing] = await db
      .select({ id: outreachMessages.id })
      .from(outreachMessages)
      .where(eq(outreachMessages.leadId, leadId))
      .limit(1);
    if (existing) return { ok: true, skipped: true, id: existing.id };
  }

  const result = await generateOutreachEmail(
    {
      businessName: lead.businessName ?? "",
      trade: lead.trade ?? "",
      city: lead.city ?? "",
      state: lead.state ?? "",
      contactName: lead.leadName ?? undefined,
      // Brain fields
      leadPriority: lead.leadPriority ?? "medium",
      followupCount: lead.followupCount ?? 0,
      lastMessageTypeSent: lead.lastMessageTypeSent,
    },
    existingHashes
  );

  existingHashes.add(result.hash);

  const generationContext = {
    business_name: lead.businessName ?? "",
    trade: lead.trade ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    source: lead.source ?? "",
    message_type: result.messageType,
  };

  const [inserted] = await db
    .insert(outreachMessages)
    .values({
      leadId,
      subject: result.subject,
      body: result.body,
      messageHash: result.hash,
      generationContext,
      generatedBy: "gpt5-nano",
      status: "pending_review",
      messageType: result.messageType,
      messageVersionHash: result.messageVersionHash,
    })
    .returning();

  // Update lead's brain state
  await db
    .update(contractorLeads)
    .set({
      outreachStage: "message_ready",
      lastMessageTypeSent: result.messageType,
      updatedAt: new Date(),
    })
    .where(eq(contractorLeads.id, leadId));

  return { ok: true, id: inserted.id };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      lead_id?: string;
      lead_ids?: string[];
      force_regenerate?: boolean;
    };

    // Pre-fetch all existing hashes once
    const existingHashes = new Set(
      (
        await db
          .select({ hash: outreachMessages.messageHash })
          .from(outreachMessages)
      )
        .map((r) => r.hash ?? "")
        .filter(Boolean)
    );

    // Bulk mode: lead_ids[]
    if (Array.isArray(body.lead_ids) && body.lead_ids.length > 0) {
      const leadIds = body.lead_ids.filter(Boolean);
      const skipIfExists = body.force_regenerate !== true;
      let generated = 0;
      let skipped = 0;
      let failed = 0;
      const results: Array<{ lead_id: string; ok: boolean; message_id?: string; skipped?: boolean; error?: string }> = [];

      for (const leadId of leadIds) {
        try {
          const r = await generateForLead(leadId, existingHashes, skipIfExists);
          results.push({ lead_id: leadId, ok: r.ok, message_id: r.id, skipped: r.skipped, error: r.error });
          if (r.skipped) skipped++;
          else if (r.ok) generated++;
          else failed++;
        } catch (e) {
          results.push({ lead_id: leadId, ok: false, error: String(e) });
          failed++;
        }
      }

      return NextResponse.json({ ok: true, data: { generated, skipped, failed, results } });
    }

    // Single mode: lead_id
    const leadId = body.lead_id;
    if (!leadId) {
      return NextResponse.json({ ok: false, error: "lead_id_required" }, { status: 400 });
    }

    const [lead] = await db
      .select()
      .from(contractorLeads)
      .where(eq(contractorLeads.id, leadId))
      .limit(1);

    if (!lead) {
      return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
    }

    const result = await generateOutreachEmail(
      {
        businessName: lead.businessName ?? "",
        trade: lead.trade ?? "",
        city: lead.city ?? "",
        state: lead.state ?? "",
        contactName: lead.leadName ?? undefined,
        leadPriority: lead.leadPriority ?? "medium",
        followupCount: lead.followupCount ?? 0,
        lastMessageTypeSent: lead.lastMessageTypeSent,
      },
      existingHashes
    );

    const generationContext = {
      business_name: lead.businessName ?? "",
      trade: lead.trade ?? "",
      city: lead.city ?? "",
      state: lead.state ?? "",
      source: lead.source ?? "",
      message_type: result.messageType,
    };

    const [inserted] = await db
      .insert(outreachMessages)
      .values({
        leadId,
        subject: result.subject,
        body: result.body,
        messageHash: result.hash,
        generationContext,
        generatedBy: "gpt5-nano",
        status: "pending_review",
        messageType: result.messageType,
        messageVersionHash: result.messageVersionHash,
      })
      .returning();

    // Update lead's brain state
    await db
      .update(contractorLeads)
      .set({
        outreachStage: "message_ready",
        lastMessageTypeSent: result.messageType,
        updatedAt: new Date(),
      })
      .where(eq(contractorLeads.id, leadId));

    return NextResponse.json({
      ok: true,
      data: {
        id: inserted.id,
        lead_id: inserted.leadId,
        subject: inserted.subject,
        body: inserted.body,
        message_hash: inserted.messageHash,
        message_type: inserted.messageType,
        message_version_hash: inserted.messageVersionHash,
        generation_context: inserted.generationContext,
        status: inserted.status,
        created_at: inserted.createdAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    console.error("LGS messages generate error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "generate_failed" },
      { status: 500 }
    );
  }
}
