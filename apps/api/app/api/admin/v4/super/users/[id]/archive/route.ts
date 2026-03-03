import { z } from "zod";
import { enforceTier, requireAdminIdentityWithTier } from "../../../../../_lib/adminTier";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { userLifecycleRepo } from "@/src/adminBus";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  reason: z.string().trim().min(1),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof Response) return identity;
  const forbidden = enforceTier(identity, "ADMIN_SUPER");
  if (forbidden) return forbidden;

  try {
    const { id } = await ctx.params;
    const bodyRaw = await req.json().catch(() => null);
    const body = BodySchema.safeParse(bodyRaw);
    if (!body.success) return err(400, "ADMIN_SUPER_USER_ARCHIVE_INVALID", "reason required");

    const result = await userLifecycleRepo.archiveManagedUser({
      userId: id,
      adminId: identity.userId,
      reason: body.data.reason,
    });
    if (!result.ok) return err(result.status, result.code, result.message);

    await adminAuditLog(req, { userId: identity.userId, role: "ADMIN", authSource: identity.authSource }, {
      action: "USER_ARCHIVED",
      entityType: "User",
      entityId: id,
      metadata: {
        archived_by_admin_id: identity.userId,
        reason: body.data.reason,
      },
    });

    return ok(result.data);
  } catch (e) {
    console.error("[ADMIN_SUPER_USER_ARCHIVE_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(500, "ADMIN_SUPER_USER_ARCHIVE_FAILED", "Failed to archive user");
  }
}
