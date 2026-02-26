import { NextResponse } from "next/server";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";
import { getAccountStatus } from "@/src/services/v4/contractorAccountStatusService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(req: Request) {
  let requestId: string | undefined;
  try {
    const ctx = await requireContractorV4(req);
    if (ctx instanceof Response) return ctx;
    requestId = ctx.requestId;
    const status = await getAccountStatus(ctx.internalUser.id);
    return NextResponse.json({
      strikeCount: status.strikeCount,
      activeSuspension: status.activeSuspension,
      suspensionExpiry: status.suspensionExpiry?.toISOString() ?? null,
    });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_ACCOUNT_STATUS_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
