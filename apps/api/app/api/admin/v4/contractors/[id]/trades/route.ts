/**
 * GET /api/admin/v4/contractors/[id]/trades
 * Admin-only: fetch trade skills + certifications for a contractor.
 */
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getTradeSkillsWithCerts } from "@/src/services/v4/contractorTradeService";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const { id } = await ctx.params;
    const trades = await getTradeSkillsWithCerts(id);
    return ok({ trades });
  } catch (error) {
    console.error("[ADMIN_V4_CONTRACTOR_TRADES_ERROR]", { error });
    return err(500, "ADMIN_V4_CONTRACTOR_TRADES_FAILED", "Failed to load trade skills");
  }
}
