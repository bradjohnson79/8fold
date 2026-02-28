import { err, ok } from "@/src/lib/api/adminV4Response";
import { requireAdminTier, userLifecycleRepo } from "@/src/adminBus";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminTier(req, "ADMIN_OPERATOR");
  if (authed instanceof Response) return authed;

  try {
    const { id } = await ctx.params;
    const result = await userLifecycleRepo.restoreManagedUser({
      userId: id,
      adminId: authed.adminId,
    });
    if (!result.ok) return err(result.status, result.code, result.message);
    return ok(result.data);
  } catch (error) {
    console.error("[ADMIN_V4_USER_RESTORE_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_USER_RESTORE_FAILED", "Failed to restore user");
  }
}
