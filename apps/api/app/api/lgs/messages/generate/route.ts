/**
 * LGS: Generate outreach message for a contractor lead.
 *
 * Single and bulk generation both delegate to the shared automation path,
 * which uses the unified GPT prompt/formatter from the LGS message service.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPosterEmailMessages, outreachMessages } from "@/db/schema/directoryEngine";
import {
  generateContractorMessageForLead,
  generateJobPosterMessageForLead,
} from "@/src/services/lgs/outreachAutomationService";

async function readMessageById(messageId: string) {
  const [inserted] = await db
    .select({
      id: outreachMessages.id,
      leadId: outreachMessages.leadId,
      subject: outreachMessages.subject,
      body: outreachMessages.body,
      messageHash: outreachMessages.messageHash,
      messageType: outreachMessages.messageType,
      messageVersionHash: outreachMessages.messageVersionHash,
      status: outreachMessages.status,
      createdAt: outreachMessages.createdAt,
    })
    .from(outreachMessages)
    .where(eq(outreachMessages.id, messageId))
    .limit(1);

  return inserted ?? null;
}

async function readJobPosterMessageById(messageId: string) {
  const [inserted] = await db
    .select({
      id: jobPosterEmailMessages.id,
      leadId: jobPosterEmailMessages.leadId,
      subject: jobPosterEmailMessages.subject,
      body: jobPosterEmailMessages.body,
      messageHash: jobPosterEmailMessages.messageHash,
      messageType: jobPosterEmailMessages.messageType,
      messageVersionHash: jobPosterEmailMessages.messageVersionHash,
      status: jobPosterEmailMessages.status,
      createdAt: jobPosterEmailMessages.createdAt,
    })
    .from(jobPosterEmailMessages)
    .where(eq(jobPosterEmailMessages.id, messageId))
    .limit(1);

  return inserted ?? null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      lead_id?: string;
      lead_ids?: string[];
      force_regenerate?: boolean;
      pipeline?: "contractor" | "jobs";
    };
    const pipeline = body.pipeline === "jobs" ? "jobs" : "contractor";

    // Bulk generation
    if (Array.isArray(body.lead_ids) && body.lead_ids.length > 0) {
      let generated = 0, skipped = 0, failed = 0;
      const results: Array<{ lead_id: string; ok: boolean; message_id?: string; skipped?: boolean; error?: string }> = [];
      const existingHashes = new Set<string>();

      for (const leadId of body.lead_ids.filter(Boolean)) {
        try {
          const result = pipeline === "jobs"
            ? await generateJobPosterMessageForLead(leadId, body.force_regenerate !== true)
            : await generateContractorMessageForLead(
                leadId,
                existingHashes,
                body.force_regenerate !== true,
              );
          results.push({ lead_id: leadId, ok: result.ok, message_id: result.id, skipped: result.skipped, error: result.error });
          if (result.skipped) skipped++;
          else if (result.ok) generated++;
          else failed++;
        } catch (err) {
          results.push({ lead_id: leadId, ok: false, error: err instanceof Error ? err.message : "failed" });
          failed++;
        }
      }
      return Response.json({ ok: true, data: { generated, skipped, failed, results } });
    }

    // Single generation
    const leadId = body.lead_id;
    if (!leadId) return Response.json({ ok: false, error: "lead_id_required" }, { status: 400 });

    const result = pipeline === "jobs"
      ? await generateJobPosterMessageForLead(leadId, body.force_regenerate !== true)
      : await generateContractorMessageForLead(
          leadId,
          new Set<string>(),
          body.force_regenerate !== true,
        );
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error ?? "generation_failed" }, { status: result.error === "lead_not_found" ? 404 : 400 });
    }

    if (result.skipped) {
      return Response.json({ ok: true, data: { skipped: true, message_id: result.id } });
    }

    const inserted = pipeline === "jobs"
      ? await readJobPosterMessageById(result.id!)
      : await readMessageById(result.id!);
    if (!inserted) {
      return Response.json({ ok: false, error: "message_not_found" }, { status: 404 });
    }

    return Response.json({
      ok: true,
      data: {
        id: inserted.id,
        lead_id: inserted.leadId,
        subject: inserted.subject,
        body: inserted.body,
        message_hash: inserted.messageHash,
        message_type: inserted.messageType,
        message_version_hash: inserted.messageVersionHash,
        status: inserted.status,
        created_at: inserted.createdAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    console.error("GENERATION ERROR:", err);
    return Response.json({ ok: false, error: "Message generation failed" }, { status: 500 });
  }
}
