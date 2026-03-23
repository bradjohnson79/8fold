/**
 * LGS: Reject outreach message.
 */
import { NextResponse } from "next/server";
import { rejectContractorMessage } from "@/src/services/lgs/outreachAutomationService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;
    if (!messageId) {
      return NextResponse.json({ ok: false, error: "message_id_required" }, { status: 400 });
    }

    const result = await rejectContractorMessage(messageId);
    if (!result.ok) {
      const status = result.error === "message_not_found" ? 404 : 400;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("LGS messages reject error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "reject_failed" },
      { status: 500 }
    );
  }
}
