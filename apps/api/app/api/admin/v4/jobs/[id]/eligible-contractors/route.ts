import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { adminGetEligibleContractors } from "@/src/services/v4/routerStage2ContractorSelectionService";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id } = await ctx.params;

  try {
    const result = await adminGetEligibleContractors(id);

    if (result.kind === "not_found") {
      return err(404, "ADMIN_ROUTE_JOB_NOT_FOUND", "Job not found");
    }
    if (result.kind === "job_not_available") {
      return err(409, "ADMIN_ROUTE_JOB_NOT_AVAILABLE", "Job is not available for routing (must be OPEN_FOR_ROUTING or APPRAISAL_PENDING)");
    }
    if (result.kind === "missing_job_coords") {
      return err(409, "ADMIN_ROUTE_MISSING_COORDS", "Job is missing geographic coordinates required for contractor matching");
    }

    return ok({ job: result.job, contractors: result.contractors });
  } catch (e) {
    console.error("[ADMIN_V4_ELIGIBLE_CONTRACTORS_ERROR]", {
      jobId: id,
      message: e instanceof Error ? e.message : String(e),
    });
    return err(500, "ADMIN_V4_ELIGIBLE_CONTRACTORS_FAILED", "Failed to load eligible contractors");
  }
}
