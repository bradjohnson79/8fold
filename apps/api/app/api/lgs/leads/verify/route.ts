import { NextResponse } from "next/server";
import { enqueueLeadVerificationBatch } from "@/src/services/lgs/emailVerificationService";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      pipeline?: "contractor" | "jobs";
      lead_ids?: string[];
      all_pending?: boolean;
    };

    const pipeline = body.pipeline === "jobs" ? "jobs" : "contractor";
    const leadIds = Array.isArray(body.lead_ids) ? body.lead_ids.filter(Boolean) : [];
    const allPending = body.all_pending === true || leadIds.length === 0;

    console.log("[Verify] Started batch", {
      pipeline,
      selected: leadIds.length,
      allPending,
    });

    const result = await enqueueLeadVerificationBatch({
      pipeline,
      leadIds,
      allPending,
    });

    return NextResponse.json({
      ok: true,
      data: {
        pipeline,
        ...result,
        accepted: result.queued + result.cached + result.alreadyQueued,
      },
    });
  } catch (err) {
    console.error("[Verify] Batch queue error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "verification_queue_failed" },
      { status: 500 }
    );
  }
}
