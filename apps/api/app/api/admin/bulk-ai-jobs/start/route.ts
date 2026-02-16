import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { isDevelopmentMocksEnabled } from "@/src/config/developmentMocks";

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    if (!isDevelopmentMocksEnabled()) {
      return NextResponse.json(
        { ok: false, error: "Bulk AI test jobs require DEVELOPMENT_MOCKS=true" },
        { status: 403 }
      );
    }
    return NextResponse.json({ ok: true, data: { bulkJobId: "" } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/bulk-ai-jobs/start", {
      route: "/api/admin/bulk-ai-jobs/start",
      userId: auth.userId,
    });
  }
}
