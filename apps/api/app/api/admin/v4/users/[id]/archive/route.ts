import { z } from "zod";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { requireAdminTier, userLifecycleRepo } from "@/src/adminBus";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  reason: z.string().trim().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminTier(req, "ADMIN_OPERATOR");
  if (authed instanceof Response) return authed;

  try {
    const { id } = await ctx.params;
    const payload = await req.json().catch(() => null);
    const body = BodySchema.safeParse(payload);
    if (!body.success) {
      return err(400, "ADMIN_V4_ARCHIVE_INVALID", "Invalid body: reason is required");
    }

    const result = await userLifecycleRepo.archiveManagedUser({
      userId: id,
      adminId: authed.adminId,
      reason: body.data.reason,
    });
    if (!result.ok) return err(result.status, result.code, result.message);
    return ok(result.data);
  } catch (error) {
    console.error("[ADMIN_V4_USER_ARCHIVE_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_USER_ARCHIVE_FAILED", "Failed to archive user");
  }
}
