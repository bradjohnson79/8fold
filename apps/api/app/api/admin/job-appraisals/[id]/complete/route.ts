import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    return NextResponse.json({ ok: true, data: { resumeUrl: "" } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/job-appraisals/:id/complete", { route: "/api/admin/job-appraisals/[id]/complete", userId: auth.userId });
  }
}
