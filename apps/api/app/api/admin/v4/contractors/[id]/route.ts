import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getContractorDetail } from "@/src/services/adminV4/usersReadService";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const { id } = await ctx.params;
    const data = await getContractorDetail(id);
    if (!data) return err(404, "ADMIN_V4_CONTRACTOR_NOT_FOUND", "Contractor not found");
    return ok(data);
  } catch (error) {
    console.error("[ADMIN_V4_CONTRACTOR_DETAIL_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_CONTRACTOR_DETAIL_FAILED", "Failed to load contractor detail");
  }
}
