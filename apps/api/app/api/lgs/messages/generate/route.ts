/**
 * LGS: Generate outreach messages.
 *
 * Bulk generation remains here. Single-lead generation delegates to the
 * unified message request service so both personas share the same endpoint
 * contract and response handling.
 */
import {
  generateContractorMessageForLead,
  generateJobPosterMessageForLead,
} from "@/src/services/lgs/outreachAutomationService";
import {
  handleSingleMessageGeneration,
  type SingleMessageRequestBody,
} from "@/src/services/lgs/messageGenerationRequestService";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as SingleMessageRequestBody & {
      lead_ids?: string[];
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

    return handleSingleMessageGeneration(body);
  } catch (err) {
    console.error("GENERATION ERROR:", err);
    return Response.json({ ok: false, error: "Message generation failed" }, { status: 500 });
  }
}
