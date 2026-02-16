import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json({ ok: true, data: { deleted: 0 } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/bulk-delete-mocks", { route: "/api/admin/jobs/bulk-delete-mocks", userId: auth.userId });
  }
}
