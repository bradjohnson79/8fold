import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json({ ok: true, data: { plans: [] } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/ai-agent-pipeline/plans", {
      route: "/api/admin/ai-agent-pipeline/plans",
      userId: auth.userId,
    });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json({ ok: true, data: { planId: "" } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/ai-agent-pipeline/plans", {
      route: "/api/admin/ai-agent-pipeline/plans",
      userId: auth.userId,
    });
  }
}
