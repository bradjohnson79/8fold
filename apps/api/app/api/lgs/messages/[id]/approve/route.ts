/**
 * LGS: Approve outreach message → insert into lgs_outreach_queue.
 */
import { NextResponse } from "next/server";
import { approveContractorMessage } from "@/src/services/lgs/outreachAutomationService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;
    if (!messageId) {
      return NextResponse.json({ ok: false, error: "message_id_required" }, { status: 400 });
    }

    const result = await approveContractorMessage(messageId);
    if (!result.ok) {
      const status = result.error === "message_not_found" ? 404 : 400;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    return NextResponse.json({ ok: true, data: { message_id: messageId, lead_id: result.leadId, status: "approved" } });
  } catch (err) {
    console.error("LGS messages approve error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "approve_failed" },
      { status: 500 }
    );
  }
}
