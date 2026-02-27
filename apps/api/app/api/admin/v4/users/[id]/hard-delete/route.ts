import { err, ok } from "@/src/lib/api/adminV4Response";
import { requireAdminTier, userLifecycleRepo } from "@/src/adminBus";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminTier(req, "ADMIN_SUPER");
  if (authed instanceof Response) return authed;

  try {
    const { id } = await ctx.params;
    const result = await userLifecycleRepo.hardDeleteManagedUser({ userId: id });
    if (!result.ok) return err(result.status, result.code, result.message);
    return ok(result.data);
  } catch (error) {
    console.error("[ADMIN_V4_USER_HARD_DELETE_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_USER_HARD_DELETE_FAILED", "Failed to permanently delete user");
  }
}
