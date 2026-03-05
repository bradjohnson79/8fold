import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoleCompletion } from "@/src/auth/requireRoleCompletion";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { routeStage2JobToContractors } from "@/src/services/v4/routerStage2ContractorSelectionService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

const BodySchema = z.object({
  contractorIds: z.array(z.string().min(1)).min(1).max(5),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  let requestId: string | undefined;
  try {
    const authed = await requireV4Role(req, "ROUTER");
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;
    const completionGuard = await requireRoleCompletion(authed.userId, "ROUTER");
    if (completionGuard) return completionGuard;

    const { jobId } = await params;
    if (!jobId) {
      return NextResponse.json(
        toV4ErrorResponse({ status: 400, code: "V4_INVALID_REQUEST", message: "Invalid job ID" } as V4Error, requestId),
        { status: 400 },
      );
    }

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        toV4ErrorResponse({ status: 400, code: "V4_INVALID_REQUEST", message: "Invalid input" } as V4Error, requestId),
        { status: 400 },
      );
    }

    const result = await routeStage2JobToContractors(authed.userId, jobId, parsed.data.contractorIds);

    if (result.kind === "ok") {
      return NextResponse.json({ ok: true, created: result.created }, { status: 200 });
    }
    if (result.kind === "not_found") {
      return NextResponse.json(toV4ErrorResponse({ status: 404, code: "V4_NOT_FOUND", message: "Not found" } as V4Error, requestId), { status: 404 });
    }
    if (result.kind === "job_not_available") {
      return NextResponse.json(
        toV4ErrorResponse({ status: 409, code: "V4_JOB_NOT_AVAILABLE", message: "Job not available" } as V4Error, requestId),
        { status: 409 },
      );
    }
    if (result.kind === "missing_job_coords") {
      return NextResponse.json(
        toV4ErrorResponse({ status: 409, code: "V4_MISSING_COORDS", message: "Job location coordinates are missing" } as V4Error, requestId),
        { status: 409 },
      );
    }
    if (result.kind === "too_many") {
      return NextResponse.json(
        toV4ErrorResponse({ status: 400, code: "V4_TOO_MANY", message: "Select between 1 and 5 contractors" } as V4Error, requestId),
        { status: 400 },
      );
    }
    if (result.kind === "contractor_not_eligible") {
      return NextResponse.json(
        toV4ErrorResponse({ status: 409, code: "V4_CONTRACTOR_NOT_ELIGIBLE", message: "Contractor not eligible for this job" } as V4Error, requestId),
        { status: 409 },
      );
    }
    if (result.kind === "payment_setup_required") {
      return NextResponse.json({ error: "PAYMENT_SETUP_REQUIRED" }, { status: 403 });
    }

    const wrapped = internal("V4_ROUTER_ROUTE_JOB_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_ROUTER_ROUTE_JOB_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
