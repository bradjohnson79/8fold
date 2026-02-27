import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getRouterDetail } from "@/src/services/adminV4/usersReadService";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const { id } = await ctx.params;
    const data = await getRouterDetail(id);
    if (!data) return err(404, "ADMIN_V4_ROUTER_NOT_FOUND", "Router not found");
    return ok(data);
  } catch (error) {
    console.error("[ADMIN_V4_ROUTER_DETAIL_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_ROUTER_DETAIL_FAILED", "Failed to load router detail");
  }
}
