import { requireAdminTier } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getReconciliationDetails } from "@/src/services/stripeGateway/reconciliationService";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const authed = await requireAdminTier(req, "ADMIN_SUPER");
  if (authed instanceof Response) return authed;

  try {
    const { jobId } = await ctx.params;
    const id = String(jobId ?? "").trim();
    if (!id) return err(400, "ADMIN_V4_STRIPE_RECON_JOB_INVALID", "jobId is required");
    const data = await getReconciliationDetails(id);
    return ok(data);
  } catch (error) {
    return err(
      500,
      "ADMIN_V4_STRIPE_RECON_JOB_FAILED",
      error instanceof Error ? error.message : "Failed to load reconciliation details",
    );
  }
}
