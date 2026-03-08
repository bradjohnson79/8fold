import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { generateConsentLink } from "@/src/services/v4/v4JobPriceAdjustmentService";
import { err, ok } from "@/src/lib/api/adminV4Response";

export async function POST(req: Request, ctx: { params: Promise<{ adjustmentId: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { adjustmentId } = await ctx.params;

  try {
    const { url, expiresAt } = await generateConsentLink(adjustmentId, authed.adminId);
    return ok({ url, expiresAt: expiresAt.toISOString() });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    if (status === 404) return err(404, "ADJUSTMENT_NOT_FOUND", "Adjustment not found");
    return err(status, "GENERATE_LINK_FAILED", e?.message ?? "Failed to generate link");
  }
}
