import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { testNano } from "@/src/ai/diagnostics/testNano";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await testNano();
    return NextResponse.json({ ok: true, data: { model: "gpt-5-nano", result } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/ai/diagnostics/test-nano", {
      route: "/api/admin/ai/diagnostics/test-nano",
      userId: auth.userId,
    });
  }
}

