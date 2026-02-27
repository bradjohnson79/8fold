import { mapUsersRowsToAdminUserDTO, requireAdmin, routersRepo } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireAdmin(req);
  if (authed instanceof Response) return authed;

  try {
    const { searchParams } = new URL(req.url);
    const params = routersRepo.parseRoleListParams(searchParams);
    const data = await routersRepo.list(params);
    return ok({ ...data, rows: mapUsersRowsToAdminUserDTO(data.rows as any[]) });
  } catch (error) {
    console.error("[ADMIN_V4_ROUTERS_LIST_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_ROUTERS_LIST_FAILED", "Failed to load routers");
  }
}
