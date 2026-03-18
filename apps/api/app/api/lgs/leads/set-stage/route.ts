/**
 * LGS Brain: Bulk set lead outreach stage.
 * POST body: { lead_ids: string[], stage: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";

const VALID_STAGES = ["not_contacted", "message_ready", "queued", "sent", "replied", "converted", "paused", "archived"];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { lead_ids?: string[]; stage?: string };
    const { lead_ids, stage } = body;

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ ok: false, error: "lead_ids_required" }, { status: 400 });
    }
    if (!stage || !VALID_STAGES.includes(stage)) {
      return NextResponse.json({ ok: false, error: "invalid_stage" }, { status: 400 });
    }

    await db
      .update(contractorLeads)
      .set({ outreachStage: stage, updatedAt: new Date() })
      .where(inArray(contractorLeads.id, lead_ids));

    return NextResponse.json({ ok: true, data: { updated: lead_ids.length } });
  } catch (err) {
    console.error("LGS set-stage error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
