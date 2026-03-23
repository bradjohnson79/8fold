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
import { outreachMessages } from "@/db/schema/directoryEngine";
import { generateContractorMessageForLead } from "@/src/services/lgs/outreachAutomationService";

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
          const r = await generateContractorMessageForLead(leadId, existingHashes, skipIfExists);
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

    const singleResult = await generateContractorMessageForLead(leadId, existingHashes, body.force_regenerate !== true);
    if (!singleResult.ok || !singleResult.id) {
      const status = singleResult.error === "lead_not_found" ? 404 : 400;
      return NextResponse.json({ ok: false, error: singleResult.error ?? "generate_failed" }, { status });
    }

    const [inserted] = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.id, singleResult.id))
      .limit(1);
    if (!inserted) {
      return NextResponse.json({ ok: false, error: "message_not_found_after_generate" }, { status: 500 });
    }

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
