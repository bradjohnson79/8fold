import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { rejectByAdmin } from "@/src/services/v4/v4JobPriceAdjustmentService";
import { err, ok } from "@/src/lib/api/adminV4Response";

export async function POST(req: Request, ctx: { params: Promise<{ adjustmentId: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { adjustmentId } = await ctx.params;

  try {
    await rejectByAdmin(adjustmentId);
    return ok({ rejected: true });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    return err(status, "REJECT_FAILED", e?.message ?? "Failed to reject");
  }
}
