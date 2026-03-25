import { NextResponse } from "next/server";
import {
  generateContractorMessageForLead,
  generateJobPosterMessageForLead,
} from "@/src/services/lgs/outreachAutomationService";

type LeadType = "contractor" | "job_poster";

type BulkGenerateRequest = {
  leadIds?: string[];
  leadType?: LeadType;
};

type BulkGenerateResult = {
  lead_id: string;
  ok: boolean;
  skipped?: boolean;
  message_id?: string;
  error?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as BulkGenerateRequest;
    const leadType = body.leadType === "job_poster" ? "job_poster" : "contractor";
    const leadIds = Array.from(
      new Set(
        (Array.isArray(body.leadIds) ? body.leadIds : [])
          .map((id) => String(id ?? "").trim())
          .filter(Boolean),
      ),
    );

    if (leadIds.length === 0) {
      return NextResponse.json({ ok: false, success: false, error: "lead_ids_required" }, { status: 400 });
    }
    if (leadIds.length > 100) {
      return new NextResponse("Max 100 leads per batch", { status: 400 });
    }

    let completed = 0;
    let generated = 0;
    let skipped = 0;
    let failed = 0;
    const total = leadIds.length;
    const results: BulkGenerateResult[] = [];
    const existingHashes = new Set<string>();

    for (const leadId of leadIds) {
      try {
        const result = leadType === "job_poster"
          ? await generateJobPosterMessageForLead(leadId)
          : await generateContractorMessageForLead(leadId, existingHashes, true);

        results.push({
          lead_id: leadId,
          ok: result.ok,
          skipped: result.skipped,
          message_id: result.id,
          error: result.error,
        });

        if (result.skipped) skipped++;
        else if (result.ok) generated++;
        else failed++;
      } catch (error) {
        failed++;
        results.push({
          lead_id: leadId,
          ok: false,
          error: error instanceof Error ? error.message : "generation_failed",
        });
      } finally {
        completed++;
      }
    }

    return NextResponse.json({
      ok: true,
      success: true,
      completed,
      total,
      generated,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    console.error("[LGS] Bulk generate error:", error);
    return NextResponse.json({ ok: false, success: false, error: "bulk_generation_failed" }, { status: 500 });
  }
}
