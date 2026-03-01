import { requireAdminTier } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getFinancialIntegrityAlertDetail } from "@/src/services/financialIntegrity/alertEngine";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminTier(req, "ADMIN_OPERATOR");
  if (authed instanceof Response) return authed;

  try {
    const { id } = await ctx.params;
    const alertId = String(id ?? "").trim();
    if (!alertId) return err(400, "ADMIN_V4_FINANCIAL_INTEGRITY_ID_INVALID", "Alert id is required");

    const detail = await getFinancialIntegrityAlertDetail(alertId);
    if (!detail) return err(404, "ADMIN_V4_FINANCIAL_INTEGRITY_NOT_FOUND", "Alert not found");
    return ok(detail);
  } catch (error) {
    return err(
      500,
      "ADMIN_V4_FINANCIAL_INTEGRITY_DETAIL_FAILED",
      error instanceof Error ? error.message : "Failed to load alert detail",
    );
  }
}
