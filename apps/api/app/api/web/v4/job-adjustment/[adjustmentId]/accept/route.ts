import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { acceptAdjustment } from "@/src/services/v4/v4JobPriceAdjustmentService";

export async function POST(req: Request, ctx: { params: Promise<{ adjustmentId: string }> }) {
  const authed = await requireAuth(req);
  if (authed instanceof Response) return authed;
  const user = authed.internalUser;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { adjustmentId } = await ctx.params;
  const raw = await req.json().catch(() => ({}));
  const token = String(raw?.token ?? "").trim();

  try {
    const { clientSecret, paymentIntentId } = await acceptAdjustment(adjustmentId, token, user.id);
    return NextResponse.json({ ok: true, clientSecret, paymentIntentId });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to accept" }, { status });
  }
}
