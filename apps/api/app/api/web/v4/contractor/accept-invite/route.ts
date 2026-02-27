import { NextResponse } from "next/server";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";
import { acceptInvite } from "@/src/services/v4/contractorInviteService";
import { badRequest, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const ctx = await requireContractorV4(req);
    if (ctx instanceof Response) return ctx;
    requestId = ctx.requestId;

    const body = (await req.json().catch(() => null)) as { jobId?: string } | null;
    const jobId = String(body?.jobId ?? "").trim();
    if (!jobId) throw badRequest("V4_INVALID_REQUEST", "jobId is required");

    await acceptInvite(ctx.internalUser.id, jobId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_ACCEPT_INVITE_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
