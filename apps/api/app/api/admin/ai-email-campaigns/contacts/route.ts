import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json({ ok: true, data: { contacts: [] } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/ai-email-campaigns/contacts", {
      route: "/api/admin/ai-email-campaigns/contacts",
      userId: auth.userId,
    });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json({ ok: true, data: {} });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/ai-email-campaigns/contacts", {
      route: "/api/admin/ai-email-campaigns/contacts",
      userId: auth.userId,
    });
  }
}
