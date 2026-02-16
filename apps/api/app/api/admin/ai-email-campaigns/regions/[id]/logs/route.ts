import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await ctx.params;
    return NextResponse.json({ ok: true, data: { items: [] } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/ai-email-campaigns/regions/[id]/logs", {
      route: "/api/admin/ai-email-campaigns/regions/[id]/logs",
      userId: auth.userId,
    });
  }
}
