import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { users } from "@/db/schema";
import { enforceTier, requireAdminIdentityWithTier } from "../../../../_lib/adminTier";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { userLifecycleRepo } from "@/src/adminBus";

export const dynamic = "force-dynamic";

const USER_EDIT_BLOCKED = new Set([
  "stripeCustomerId",
  "stripeDefaultPaymentMethodId",
  "stripeStatus",
  "stripeUpdatedAt",
]);

const UserPatchSchema = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.string().email().optional(),
  accountStatus: z.string().trim().max(50).optional(),
});

const auditAuth = (identity: { userId: string; adminRole: string; authSource: "admin_session" }) => ({
  userId: identity.userId,
  role: "ADMIN" as const,
  authSource: identity.authSource as "admin_session",
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof Response) return identity;
  const forbidden = enforceTier(identity, "ADMIN_SUPER");
  if (forbidden) return forbidden;

  try {
    const { id } = await ctx.params;
    const bodyRaw = await req.json().catch(() => null);
    const body = UserPatchSchema.safeParse(bodyRaw);
    if (!body.success) return err(400, "ADMIN_SUPER_USER_EDIT_INVALID", "Invalid edit payload");

    const raw = body.data as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === undefined) continue;
      if (USER_EDIT_BLOCKED.has(k)) {
        return err(400, "ADMIN_SUPER_USER_EDIT_BLOCKED", `Cannot edit protected field: ${k}`);
      }
      updates[k] = v;
    }
    if (Object.keys(updates).length === 0) return err(400, "ADMIN_SUPER_USER_EDIT_EMPTY", "No fields to update");

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!existing[0]) return err(404, "ADMIN_SUPER_USER_NOT_FOUND", "User not found");

    const now = new Date();
    const setValues = { ...updates, updatedByAdminId: identity.userId, updatedAt: now };
    await db.update(users).set(setValues as any).where(eq(users.id, id));

    await adminAuditLog(req, auditAuth(identity), {
      action: "USER_EDITED",
      entityType: "User",
      entityId: id,
      metadata: { fields: Object.keys(updates) },
    });

    return ok({ updated: true });
  } catch (e) {
    console.error("[ADMIN_SUPER_USER_EDIT_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(500, "ADMIN_SUPER_USER_EDIT_FAILED", "Failed to edit user");
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof Response) return identity;
  const forbidden = enforceTier(identity, "ADMIN_SUPER");
  if (forbidden) return forbidden;

  try {
    const { id } = await ctx.params;

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!existing[0]) return err(404, "ADMIN_SUPER_USER_NOT_FOUND", "User not found");

    const deletedAt = new Date();
    await adminAuditLog(req, auditAuth(identity), {
      action: "USER_DELETED",
      entityType: "User",
      entityId: id,
      metadata: {
        deleted_by_admin_id: identity.userId,
        deleted_reason: "hard delete",
        deleted_at: deletedAt.toISOString(),
      },
    });

    const result = await userLifecycleRepo.hardDeleteManagedUser({ userId: id });
    if (!result.ok) return err(result.status, result.code, result.message);
    return ok(result.data);
  } catch (e) {
    console.error("[ADMIN_SUPER_USER_DELETE_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(500, "ADMIN_SUPER_USER_DELETE_FAILED", "Failed to delete user");
  }
}
