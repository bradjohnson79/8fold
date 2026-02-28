import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getV4EligibleContractors } from "@/src/services/v4/routerEligibleContractorsService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  let requestId: string | undefined;
  try {
    const authed = await requireV4Role(req, "ROUTER");
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;
    const { jobId } = await params;
    if (!jobId) {
      return NextResponse.json(
        toV4ErrorResponse({ status: 400, code: "V4_INVALID_REQUEST", message: "Invalid job ID" } as V4Error, requestId),
        { status: 400 },
      );
    }

    const result = await getV4EligibleContractors(authed.userId, jobId);
    if (result.kind === "ok") return NextResponse.json(result, { status: 200 });
    if (result.kind === "not_found") {
      return NextResponse.json(toV4ErrorResponse({ status: 404, code: "V4_NOT_FOUND", message: "Not found" } as V4Error, requestId), { status: 404 });
    }
    if (result.kind === "forbidden") {
      return NextResponse.json(toV4ErrorResponse({ status: 403, code: "V4_FORBIDDEN", message: "Forbidden" } as V4Error, requestId), { status: 403 });
    }
    if (result.kind === "cross_jurisdiction_blocked") {
      return NextResponse.json(
        toV4ErrorResponse(
          { status: 403, code: "V4_CROSS_JURISDICTION", message: "8Fold restricts work to within your registered state/province." } as V4Error,
          requestId,
        ),
        { status: 403 },
      );
    }
    if (result.kind === "missing_job_coords") {
      return NextResponse.json(
        toV4ErrorResponse({ status: 409, code: "V4_MISSING_COORDS", message: "Job location coordinates are missing" } as V4Error, requestId),
        { status: 409 },
      );
    }
    if (result.kind === "job_not_available") {
      return NextResponse.json(
        toV4ErrorResponse({ status: 409, code: "V4_JOB_NOT_AVAILABLE", message: "Job not available" } as V4Error, requestId),
        { status: 409 },
      );
    }

    const wrapped = internal("V4_ROUTER_ELIGIBLE_CONTRACTORS_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_ROUTER_ELIGIBLE_CONTRACTORS_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
