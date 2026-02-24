import { NextResponse } from "next/server";
import { handleApiError } from "@/src/lib/errorHandler";
import { executePendingDisputeEnforcementActions } from "@/src/support/disputeEnforcement";
import { enforceTier, requireAdminIdentityWithTier } from "../../../../../_lib/adminTier";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("disputes") + 1;
  return parts[idx] ?? "";
}

export async function POST(req: Request) {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof NextResponse) return identity;
  const forbidden = enforceTier(identity, "ADMIN_SUPER");
  if (forbidden) return forbidden;

  try {
    const disputeId = getIdFromUrl(req);

    const result = await executePendingDisputeEnforcementActions({
      disputeCaseId: disputeId,
      actorUserId: identity.userId,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/support/disputes/[id]/enforcement/execute", {
      route: "/api/admin/support/disputes/[id]/enforcement/execute",
      userId: identity.userId,
    });
  }
}
