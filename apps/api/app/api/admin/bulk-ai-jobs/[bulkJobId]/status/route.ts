import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

export async function GET(req: Request, ctx: { params: Promise<{ bulkJobId: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { bulkJobId } = await ctx.params;
    return NextResponse.json({ ok: true, data: { id: bulkJobId, status: "IDLE", items: [] } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/bulk-ai-jobs/[bulkJobId]/status", {
      route: "/api/admin/bulk-ai-jobs/[bulkJobId]/status",
      userId: auth.userId,
    });
  }
}
