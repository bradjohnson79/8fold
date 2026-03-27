import { NextResponse } from "next/server";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";
import { listJobsBothTabs } from "@/src/services/v4/contractorJobService";
import { computeExecutionEligibility, mapLegacyStatusForExecution } from "@/src/services/v4/jobExecutionService";

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  if (typeof value === "object" && value !== null && "toISOString" in value && typeof (value as { toISOString?: unknown }).toISOString === "function") {
    try {
      return ((value as { toISOString: () => string }).toISOString());
    } catch {
      return null;
    }
  }
  return null;
}

function fallbackAssignedAt(primary: unknown, secondary: unknown): string {
  return toIsoOrNull(primary) ?? toIsoOrNull(secondary) ?? new Date(0).toISOString();
}

function safeJobsResponse(args?: {
  assignedJobs?: unknown;
  completedJobs?: unknown;
}) {
  const assignedJobs = Array.isArray(args?.assignedJobs) ? args?.assignedJobs : [];
  const completedJobs = Array.isArray(args?.completedJobs) ? args?.completedJobs : [];
  return {
    ok: true,
    jobs: assignedJobs,
    assignedJobs,
    completedJobs,
  };
}

export async function GET(req: Request) {
  try {
    const ctx = await requireContractorV4(req);
    if (ctx instanceof Response) return ctx;
    const contractorId = ctx.internalUser?.id ?? null;
    console.log("[contractor/jobs] contractorId:", contractorId);

    if (!contractorId) {
      console.log("[contractor/jobs] jobs raw result:", { assignedRows: [], completedRows: [] });
      return NextResponse.json(safeJobsResponse());
    }

    const rawResult = await listJobsBothTabs(contractorId);
    const assignedRows = Array.isArray(rawResult?.assignedRows) ? rawResult.assignedRows : [];
    const completedRows = Array.isArray(rawResult?.completedRows) ? rawResult.completedRows : [];
    console.log("[contractor/jobs] jobs raw result:", {
      assignedCount: assignedRows.length,
      completedCount: completedRows.length,
    });
    const now = new Date();

    const assignedJobs = assignedRows.map((j) => {
        const normalizedStatus = String(j?.status ?? "");
        const eligibility = computeExecutionEligibility(
          {
            id: String(j?.id ?? ""),
            status: mapLegacyStatusForExecution(normalizedStatus),
            appointment_at: j?.appointment_at ?? null,
            completed_at: j?.completed_at ?? null,
            contractor_marked_complete_at: j?.contractor_marked_complete_at ?? null,
            poster_marked_complete_at: j?.poster_marked_complete_at ?? null,
          },
          now,
        );
        return {
          id: String(j?.id ?? ""),
          title: typeof j?.title === "string" ? j.title : null,
          scope: typeof j?.scope === "string" ? j.scope : null,
          region: typeof j?.region === "string" ? j.region : null,
          status: normalizedStatus,
          assignedAt: fallbackAssignedAt(j?.assignedAt, j?.created_at),
          appointmentAt: toIsoOrNull(j?.appointment_at),
          canMarkComplete: eligibility.canMarkComplete,
          executionStatus: eligibility.executionStatus,
          contractorMarkedCompleteAt: toIsoOrNull(j?.contractor_marked_complete_at),
          posterMarkedCompleteAt: toIsoOrNull(j?.poster_marked_complete_at),
          completedAt: null,
        };
      });

    const completedJobs = completedRows.map((j) => ({
      id: String(j?.id ?? ""),
      title: typeof j?.title === "string" ? j.title : null,
      scope: typeof j?.scope === "string" ? j.scope : null,
      region: typeof j?.region === "string" ? j.region : null,
      status: String(j?.status ?? ""),
      assignedAt: fallbackAssignedAt(j?.assignedAt, j?.created_at),
      completedAt: toIsoOrNull(j?.completed_at),
      contractorMarkedCompleteAt: toIsoOrNull(j?.contractor_marked_complete_at),
      posterMarkedCompleteAt: toIsoOrNull(j?.poster_marked_complete_at),
      payoutStatus: typeof j?.payout_status === "string" ? j.payout_status : "NOT_READY",
      payoutReleaseAt: toIsoOrNull((j as any)?.completion_window_expires_at),
      hasActiveDisputeHold: Boolean((j as any)?.has_active_dispute_hold),
      contractorPayoutCents: typeof j?.contractor_payout_cents === "number" ? j.contractor_payout_cents : 0,
    }));

    return NextResponse.json(safeJobsResponse({ assignedJobs, completedJobs }));
  } catch (err) {
    console.error("[contractor/jobs] ERROR:", err);
    return NextResponse.json(safeJobsResponse(), { status: 200 });
  }
}
