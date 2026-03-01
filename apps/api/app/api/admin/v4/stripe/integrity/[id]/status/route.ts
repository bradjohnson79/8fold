import { requireAdminTier } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { updateFinancialIntegrityAlertStatus } from "@/src/services/financialIntegrity/alertEngine";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["ACKNOWLEDGED", "RESOLVED", "IGNORED"]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminTier(req, "ADMIN_OPERATOR");
  if (authed instanceof Response) return authed;

  try {
    const { id } = await ctx.params;
    const alertId = String(id ?? "").trim();
    if (!alertId) return err(400, "ADMIN_V4_FINANCIAL_INTEGRITY_ID_INVALID", "Alert id is required");

    const body = await req.json().catch(() => ({}));
    const status = String(body?.status ?? "")
      .trim()
      .toUpperCase();
    if (!ALLOWED.has(status)) {
      return err(400, "ADMIN_V4_FINANCIAL_INTEGRITY_STATUS_INVALID", "Status must be ACKNOWLEDGED, RESOLVED, or IGNORED");
    }

    const updated = await updateFinancialIntegrityAlertStatus({
      id: alertId,
      status: status as "ACKNOWLEDGED" | "RESOLVED" | "IGNORED",
      adminId: authed.adminId,
    });
    if (!updated) return err(404, "ADMIN_V4_FINANCIAL_INTEGRITY_NOT_FOUND", "Alert not found");
    return ok({ alert: updated });
  } catch (error) {
    return err(
      500,
      "ADMIN_V4_FINANCIAL_INTEGRITY_STATUS_FAILED",
      error instanceof Error ? error.message : "Failed to update alert status",
    );
  }
}
