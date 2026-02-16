import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { users } from "../../../../../../db/schema/user";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { logEvent } from "@/src/server/observability/log";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;

    const existing = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    const u = existing[0] ?? null;
    if (!u) return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });

    const now = new Date();
    await db
      .update(users)
      .set({
        status: "ACTIVE",
        suspendedUntil: null,
        suspensionReason: null,
        updatedByAdminId: auth.userId,
        updatedAt: now,
      } as any)
      .where(eq(users.id, id));

    await adminAuditLog(req, auth, {
      action: "ADMIN_USER_UNSUSPEND",
      entityType: "User",
      entityId: id,
    });

    logEvent({
      level: "info",
      event: "admin.user_action",
      route: "/api/admin/users/[id]/unsuspend",
      method: "POST",
      status: 200,
      userId: auth.userId,
      code: "ADMIN_USER_UNSUSPEND",
      context: { targetUserId: id },
    });

    return NextResponse.json({ ok: true, data: {} });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/users/[id]/unsuspend", { userId: auth.userId });
  }
}

