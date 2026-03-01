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
  try {
    const ctx = await requireContractorV4(req);
    if (ctx instanceof Response) return ctx;
    requestId = ctx.requestId;
    const completionGuard = await requireRoleCompletion(ctx.internalUser.id, "CONTRACTOR");
    if (completionGuard) return completionGuard;
    const { jobId: inviteId } = await params;
    if (!inviteId) return NextResponse.json({ error: "inviteId required" }, { status: 400 });
    const result = await acceptInviteById(ctx.internalUser.id, inviteId);
    return NextResponse.json({ success: true, jobId: result.jobId });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_ACCEPT_INVITE_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
