import { NextResponse } from "next/server";
import { confirmAdjustmentPayment } from "@/src/services/v4/v4JobPriceAdjustmentService";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ adjustmentId: string }> }) {
  const { adjustmentId } = await ctx.params;
  const raw = await req.json().catch(() => ({}));
  const paymentIntentId = String(raw?.paymentIntentId ?? "").trim();

  if (!paymentIntentId) {
    return NextResponse.json({ ok: false, error: "paymentIntentId required" }, { status: 400 });
  }

  try {
    await confirmAdjustmentPayment(adjustmentId, paymentIntentId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to confirm payment" }, { status });
  }
}
