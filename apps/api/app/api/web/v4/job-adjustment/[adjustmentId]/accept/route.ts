import { NextResponse } from "next/server";
import { acceptAdjustment } from "@/src/services/v4/v4JobPriceAdjustmentService";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ adjustmentId: string }> }) {
  const { adjustmentId } = await ctx.params;
  const raw = await req.json().catch(() => ({}));
  const token = String(raw?.token ?? "").trim();

  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  try {
    // null = token-only auth — the secure token proves poster identity.
    const { clientSecret, paymentIntentId } = await acceptAdjustment(adjustmentId, token, null);
    return NextResponse.json({ ok: true, clientSecret, paymentIntentId });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to accept" }, { status });
  }
}
