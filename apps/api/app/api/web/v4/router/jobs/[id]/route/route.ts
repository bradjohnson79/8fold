import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoleCompletion } from "@/src/auth/requireRoleCompletion";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { routeV4Job } from "@/src/services/v4/routerRouteJobService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

const BodySchema = z.object({
  contractorIds: z.array(z.string().min(1)).min(1).max(5),
});

function getJobIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("jobs") + 1;
  return parts[idx] ?? "";
}

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const authed = await requireV4Role(req, "ROUTER");
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;
    const completionGuard = await requireRoleCompletion(authed.userId, "ROUTER");
    if (completionGuard) return completionGuard;

    const jobId = getJobIdFromUrl(req);
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

    const result = await routeV4Job(authed.userId, jobId, parsed.data.contractorIds);

    if (result.kind === "ok") {
      return NextResponse.json({ ok: true, created: result.created }, { status: 200 });
    }
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
    if (result.kind === "job_archived") {
      return NextResponse.json(
        toV4ErrorResponse({ status: 409, code: "V4_JOB_ARCHIVED", message: "Archived jobs cannot be routed" } as V4Error, requestId),
        { status: 409 },
      );
    }
    if (result.kind === "job_not_available") {
      return NextResponse.json(
        toV4ErrorResponse({ status: 409, code: "V4_JOB_NOT_AVAILABLE", message: "Job not available" } as V4Error, requestId),
        { status: 409 },
      );
    }
    if (result.kind === "pricing_unlocked") {
      return NextResponse.json(
        toV4ErrorResponse({ status: 409, code: "V4_PRICING_UNLOCKED", message: "Job pricing is not locked" } as V4Error, requestId),
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
        toV4ErrorResponse({ status: 409, code: "V4_TOO_MANY", message: "Max 5 contractors per job" } as V4Error, requestId),
        { status: 409 },
      );
    }
    if (result.kind === "contractor_missing_coords" || result.kind === "contractor_not_eligible") {
      return NextResponse.json(
        toV4ErrorResponse({ status: 409, code: "V4_CONTRACTOR_NOT_ELIGIBLE", message: "Contractor not eligible" } as V4Error, requestId),
        { status: 409 },
      );
    }

    const wrapped = internal("V4_ROUTER_ROUTE_JOB_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_ROUTER_ROUTE_JOB_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
