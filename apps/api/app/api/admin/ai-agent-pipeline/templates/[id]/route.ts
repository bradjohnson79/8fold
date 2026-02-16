import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await ctx.params;
    return NextResponse.json({ ok: true, data: {} });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/ai-agent-pipeline/templates/[id]", {
      route: "/api/admin/ai-agent-pipeline/templates/[id]",
      userId: auth.userId,
    });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await ctx.params;
    return NextResponse.json({ ok: true, data: {} });
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/ai-agent-pipeline/templates/[id]", {
      route: "/api/admin/ai-agent-pipeline/templates/[id]",
      userId: auth.userId,
    });
  }
}
