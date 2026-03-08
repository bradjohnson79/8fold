import { NextResponse } from "next/server";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";
import { listJobsBothTabs } from "@/src/services/v4/contractorJobService";
import { computeExecutionEligibility, mapLegacyStatusForExecution } from "@/src/services/v4/jobExecutionService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(req: Request) {
  let requestId: string | undefined;
  try {
    const ctx = await requireContractorV4(req);
    if (ctx instanceof Response) return ctx;
    requestId = ctx.requestId;

    const { assignedRows, completedRows } = await listJobsBothTabs(ctx.internalUser.id);
    const now = new Date();

    return NextResponse.json({
      assignedJobs: assignedRows.map((j) => {
        const eligibility = computeExecutionEligibility(
          {
            id: j.id,
            status: mapLegacyStatusForExecution(String(j.status ?? "")),
            appointment_at: j.appointment_at ?? null,
            completed_at: j.completed_at ?? null,
            contractor_marked_complete_at: j.contractor_marked_complete_at ?? null,
            poster_marked_complete_at: j.poster_marked_complete_at ?? null,
          },
          now,
        );
        return {
          id: j.id,
          title: j.title,
          scope: j.scope,
          region: j.region,
          status: String(j.status ?? ""),
          assignedAt: (j.assignedAt ?? j.created_at).toISOString(),
          canMarkComplete: eligibility.canMarkComplete,
          executionStatus: eligibility.executionStatus,
          contractorMarkedCompleteAt: j.contractor_marked_complete_at?.toISOString?.() ?? null,
          posterMarkedCompleteAt: j.poster_marked_complete_at?.toISOString?.() ?? null,
          completedAt: null,
        };
      }),
      completedJobs: completedRows.map((j) => ({
        id: j.id,
        title: j.title,
        scope: j.scope,
        region: j.region,
        status: String(j.status ?? ""),
        assignedAt: (j.assignedAt ?? j.created_at).toISOString(),
        completedAt: j.completed_at?.toISOString?.() ?? null,
        contractorMarkedCompleteAt: j.contractor_marked_complete_at?.toISOString?.() ?? null,
        posterMarkedCompleteAt: j.poster_marked_complete_at?.toISOString?.() ?? null,
        payoutStatus: j.payout_status ?? "NOT_READY",
        contractorPayoutCents: j.contractor_payout_cents ?? 0,
      })),
    });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_JOBS_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
