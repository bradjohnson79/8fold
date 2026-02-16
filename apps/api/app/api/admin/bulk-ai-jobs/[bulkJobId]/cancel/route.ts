import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

export async function POST(req: Request, ctx: { params: Promise<{ bulkJobId: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await ctx.params;
    return NextResponse.json({ ok: true, data: {} });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/bulk-ai-jobs/[bulkJobId]/cancel", {
      route: "/api/admin/bulk-ai-jobs/[bulkJobId]/cancel",
      userId: auth.userId,
    });
  }
}
