import { NextResponse } from "next/server";
import { getAdjustmentForPoster } from "@/src/services/v4/v4JobPriceAdjustmentService";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ adjustmentId: string }> }) {
  const { adjustmentId } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  try {
    // Pass null for requestingUserId — the secure token is the sole auth mechanism
    // for this email-link flow. The poster may or may not have an active session.
    const data = await getAdjustmentForPoster(adjustmentId, token, null);
    return NextResponse.json({ ok: true, adjustment: data });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to load adjustment" }, { status });
  }
}
