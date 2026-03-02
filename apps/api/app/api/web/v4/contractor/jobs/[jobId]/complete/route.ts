import { NextResponse } from "next/server";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";
import { requireRoleCompletion } from "@/src/auth/requireRoleCompletion";
import { contractorMarkComplete } from "@/src/services/v4/jobExecutionService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

/** Legacy wrapper: delegates to mark-complete execution flow. */
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
    const { jobId } = await params;
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
    console.warn("[V4_LEGACY_COMPLETE_ROUTE_DEPRECATED]", { route: "/api/web/v4/contractor/jobs/[jobId]/complete" });
    const result = await contractorMarkComplete({ contractorUserId: ctx.internalUser.id, jobId });
    return NextResponse.json({ ok: true, idempotent: result.idempotent, finalized: result.finalized });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_COMPLETE_JOB_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
