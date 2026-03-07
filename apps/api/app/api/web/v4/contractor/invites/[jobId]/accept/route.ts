import { NextResponse } from "next/server";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";
import { acceptInviteById } from "@/src/services/v4/contractorInviteService";
import { getRoleCompletion } from "@/src/services/v4/roleCompletionService";
import { toAccountIncompleteResponse } from "@/src/auth/requireRoleCompletion";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  let requestId: string | undefined;
  let inviteId: string | undefined;
  let userId: string | undefined;
  try {
    console.log("[invite-accept-route] auth start");
    const ctx = await requireContractorV4(req);
    if (ctx instanceof Response) return ctx;
    requestId = ctx.requestId;
    userId = ctx.internalUser.id;
    console.log("[invite-accept-route] auth ok", { userId });

    let completionGuard: Response | null = null;
    try {
      const completion = await getRoleCompletion(userId, "CONTRACTOR");
      if (!completion?.complete) {
        completionGuard = toAccountIncompleteResponse(
          completion?.missing ?? ["TERMS", "PROFILE", "PAYMENT"],
        );
      }
    } catch (rcErr) {
      console.error("[invite-accept-route] requireRoleCompletion threw — skipping gate", {
        userId,
        message: rcErr instanceof Error ? rcErr.message : String(rcErr),
        stack: rcErr instanceof Error ? rcErr.stack?.slice(0, 500) : undefined,
      });
    }
    if (completionGuard) return completionGuard;

    const resolved = await params;
    inviteId = resolved.jobId;
    if (!inviteId) return NextResponse.json({ error: "inviteId required" }, { status: 400 });

    console.log("[invite-accept-route] calling acceptInviteById", { inviteId, userId });
    const result = await acceptInviteById(userId, inviteId);
    console.log("[invite-accept-route] accept ok", { jobId: result.jobId });
    return NextResponse.json({ success: true, jobId: result.jobId });
  } catch (err) {
    console.error("[contractor-invite-accept-error]", {
      inviteId: inviteId ?? "unknown",
      contractorUserId: userId ?? "unknown",
      message: err instanceof Error ? err.message : String(err),
      code: (err as any)?.code,
      status: (err as any)?.status,
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
    });
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_ACCEPT_INVITE_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
