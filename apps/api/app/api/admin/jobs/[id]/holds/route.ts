import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

function getIdFromUrl(req: Request): string {
  const m = req.url.match(/\/jobs\/([^/]+)\/holds/);
  return m?.[1] ?? "";
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);
    if (!id) return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 });
    return NextResponse.json({ ok: true, data: { holds: [] } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/jobs/:id/holds", { route: "/api/admin/jobs/[id]/holds", userId: auth.userId });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);
    if (!id) return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 });
    return NextResponse.json({ ok: true, data: {} });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/:id/holds", { route: "/api/admin/jobs/[id]/holds", userId: auth.userId });
  }
}
