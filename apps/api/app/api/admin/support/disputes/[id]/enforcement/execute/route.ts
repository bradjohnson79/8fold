import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { executePendingDisputeEnforcementActions } from "@/src/support/disputeEnforcement";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("disputes") + 1;
  return parts[idx] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const disputeId = getIdFromUrl(req);

    const result = await executePendingDisputeEnforcementActions({
      disputeCaseId: disputeId,
      actorUserId: auth.userId,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/support/disputes/[id]/enforcement/execute", {
      route: "/api/admin/support/disputes/[id]/enforcement/execute",
      userId: auth.userId,
    });
  }
}
