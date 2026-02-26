import { NextResponse } from "next/server";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";
import { completeJob } from "@/src/services/v4/contractorJobService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

/** POST: IN_PROGRESS → COMPLETED. Idempotent. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  let requestId: string | undefined;
  try {
    const ctx = await requireContractorV4(req);
    if (ctx instanceof Response) return ctx;
    requestId = ctx.requestId;
    const { jobId } = await params;
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
    await completeJob(ctx.internalUser.id, jobId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_COMPLETE_JOB_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
