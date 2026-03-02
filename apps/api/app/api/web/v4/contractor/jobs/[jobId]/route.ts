import { NextResponse } from "next/server";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";
import { getJobById } from "@/src/services/v4/contractorJobService";
import { computeExecutionEligibility, mapLegacyStatusForExecution } from "@/src/services/v4/jobExecutionService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(
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
    const { job, assignment } = await getJobById(ctx.internalUser.id, jobId);
    const eligibility = computeExecutionEligibility(
      {
        id: job.id,
        status: mapLegacyStatusForExecution(String(job.status ?? "")),
        appointment_at: job.appointment_at ?? null,
        completed_at: job.completed_at ?? null,
        contractor_marked_complete_at: job.contractor_marked_complete_at ?? null,
        poster_marked_complete_at: job.poster_marked_complete_at ?? null,
      },
      new Date(),
    );
    return NextResponse.json({
      job: {
        id: job.id,
        title: job.title,
        scope: job.scope,
        region: job.region,
        status: mapLegacyStatusForExecution(String(job.status ?? "")),
        addressFull: job.address_full,
        lat: job.lat,
        lng: job.lng,
        canMarkComplete: eligibility.canMarkComplete,
        executionStatus: eligibility.executionStatus,
        contractorMarkedCompleteAt: job.contractor_marked_complete_at?.toISOString?.() ?? null,
        posterMarkedCompleteAt: job.poster_marked_complete_at?.toISOString?.() ?? null,
        completedAt: job.completed_at?.toISOString?.() ?? null,
      },
      assignment: {
        status: assignment.status,
        assignedAt: assignment.assignedAt.toISOString(),
      },
    });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_JOB_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
