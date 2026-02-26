import { NextResponse } from "next/server";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";
import { listJobs, type JobListStatus } from "@/src/services/v4/contractorJobService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(req: Request) {
  let requestId: string | undefined;
  try {
    const ctx = await requireContractorV4(req);
    if (ctx instanceof Response) return ctx;
    requestId = ctx.requestId;
    const url = new URL(req.url);
    const statusParam = (url.searchParams.get("status") ?? "assigned") as JobListStatus;
    const status = statusParam === "completed" ? "completed" : "assigned";
    const jobs = await listJobs(ctx.internalUser.id, status);
    return NextResponse.json({
      jobs: jobs.map(({ job, assignmentStatus, assignedAt }) => ({
        id: job.id,
        title: job.title,
        scope: job.scope,
        region: job.region,
        status: assignmentStatus,
        assignedAt: assignedAt.toISOString(),
      })),
    });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_JOBS_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
