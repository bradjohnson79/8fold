import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json({ ok: true, data: { templates: [] } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/ai-agent-pipeline/templates", {
      route: "/api/admin/ai-agent-pipeline/templates",
      userId: auth.userId,
    });
  }
}
