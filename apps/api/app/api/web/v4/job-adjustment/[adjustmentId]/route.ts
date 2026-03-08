import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { getAdjustmentForPoster } from "@/src/services/v4/v4JobPriceAdjustmentService";

export async function GET(req: Request, ctx: { params: Promise<{ adjustmentId: string }> }) {
  const authed = await requireAuth(req);
  if (authed instanceof Response) return authed;
  const user = authed.internalUser;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 403 });

  const { adjustmentId } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  try {
    const data = await getAdjustmentForPoster(adjustmentId, token, user.id);
    return NextResponse.json({ ok: true, adjustment: data });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to load adjustment" }, { status });
  }
}
