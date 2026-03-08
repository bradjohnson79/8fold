import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { getAdjustmentByIdForAdmin } from "@/src/services/v4/v4JobPriceAdjustmentService";
import { err, ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request, ctx: { params: Promise<{ adjustmentId: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { adjustmentId } = await ctx.params;
  const adjustment = await getAdjustmentByIdForAdmin(adjustmentId);
  if (!adjustment) return err(404, "ADJUSTMENT_NOT_FOUND", "Adjustment not found");
  return ok({ adjustment });
}
