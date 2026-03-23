import { NextResponse } from "next/server";
import { rejectJobPosterMessage } from "@/src/services/lgs/outreachAutomationService";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await rejectJobPosterMessage(id);
    if (!result.ok) {
      const status = result.error === "message_not_found" ? 404 : 409;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Job Poster] Reject message error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
