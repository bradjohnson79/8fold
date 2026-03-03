import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { users } from "@/db/schema";
import { sessions } from "@/db/schema/session";
import { enforceTier, requireAdminIdentityWithTier } from "../../../../../_lib/adminTier";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getSuspensionEnd, type SuspensionDuration } from "@/src/utils/suspensionDuration";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  duration: z.enum(["1w", "1m", "3m", "6m"]),
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
    if (!body.success) return err(400, "ADMIN_SUPER_USER_SUSPEND_INVALID", "duration and reason required");

    const existing = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, id)).limit(1);
    if (!existing[0]) return err(404, "ADMIN_SUPER_USER_NOT_FOUND", "User not found");
    if (existing[0].status === "ARCHIVED") {
      return err(409, "ADMIN_SUPER_USER_ARCHIVED", "Archived users cannot be suspended");
    }

    const suspendedUntil = getSuspensionEnd(body.data.duration as SuspensionDuration);
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: "SUSPENDED",
          accountStatus: "SUSPENDED",
          suspendedUntil,
          suspensionReason: body.data.reason,
          updatedByAdminId: identity.userId,
          updatedAt: now,
        } as any)
        .where(eq(users.id, id));
      await tx.delete(sessions).where(eq(sessions.userId, id));
    });

    await adminAuditLog(req, { userId: identity.userId, role: "ADMIN", authSource: identity.authSource }, {
      action: "USER_SUSPENDED",
      entityType: "User",
      entityId: id,
      metadata: {
        duration: body.data.duration,
        reason: body.data.reason,
        suspended_until: suspendedUntil.toISOString(),
      },
    });

    return ok({ suspendedUntil: suspendedUntil.toISOString() });
  } catch (e) {
    console.error("[ADMIN_SUPER_USER_SUSPEND_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(500, "ADMIN_SUPER_USER_SUSPEND_FAILED", "Failed to suspend user");
  }
}
