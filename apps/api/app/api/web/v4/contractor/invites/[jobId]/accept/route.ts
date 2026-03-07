import { NextResponse } from "next/server";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";
import { requireRoleCompletion } from "@/src/auth/requireRoleCompletion";
import { acceptInviteById } from "@/src/services/v4/contractorInviteService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  let requestId: string | undefined;
  let inviteId: string | undefined;
  let userId: string | undefined;
  try {
    const ctx = await requireContractorV4(req);
    if (ctx instanceof Response) return ctx;
    requestId = ctx.requestId;
    userId = ctx.internalUser.id;
    const completionGuard = await requireRoleCompletion(userId, "CONTRACTOR");
    if (completionGuard) return completionGuard;
    const resolved = await params;
    inviteId = resolved.jobId;
    if (!inviteId) return NextResponse.json({ error: "inviteId required" }, { status: 400 });
    const result = await acceptInviteById(userId, inviteId);
    return NextResponse.json({ success: true, jobId: result.jobId });
  } catch (err) {
    console.error("[contractor-invite-accept-error]", {
      inviteId: inviteId ?? "unknown",
      contractorUserId: userId ?? "unknown",
      err,
    });
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_ACCEPT_INVITE_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
