import { requireAdminTier } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getContractorStripeStatus } from "@/src/services/v4/contractorStripeService";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminTier(req, "ADMIN_OPERATOR");
  if (authed instanceof Response) return authed;

  try {
    const { id } = await ctx.params;
    const result = await getContractorStripeStatus(id);
    return ok(result);
  } catch (error) {
    console.error("[ADMIN_V4_CONTRACTOR_STRIPE_REFRESH_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_CONTRACTOR_STRIPE_REFRESH_FAILED", "Failed to refresh contractor Stripe status");
  }
}
