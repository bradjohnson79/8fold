import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getV4RouterAvailableJobs } from "@/src/services/v4/routerAvailableJobsService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(req: Request) {
  let requestId: string | undefined;
  try {
    const authed = await requireV4Role(req, "ROUTER");
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;
    const result = await getV4RouterAvailableJobs(authed.userId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_ROUTER_AVAILABLE_JOBS_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
