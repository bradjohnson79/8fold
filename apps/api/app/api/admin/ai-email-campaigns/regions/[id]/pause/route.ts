import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await ctx.params;
    return NextResponse.json({ ok: true, data: {} });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/ai-email-campaigns/regions/[id]/pause", {
      route: "/api/admin/ai-email-campaigns/regions/[id]/pause",
      userId: auth.userId,
    });
  }
}
