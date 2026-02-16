import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { users } from "../../../../../../db/schema/user";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { readJsonBody } from "@/src/lib/api/readJsonBody";
import { logEvent } from "@/src/server/observability/log";

const BodySchema = z.object({
  months: z.number().int().min(1).max(6),
  reason: z.string().trim().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) {
      return NextResponse.json({ ok: false, error: "Invalid body: months 1-6, reason required" }, { status: 400 });
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!existing[0]) {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }

    const now = new Date();
    const suspendedUntil = new Date(now);
    suspendedUntil.setMonth(suspendedUntil.getMonth() + body.data.months);

    await db
      .update(users)
      .set({
        status: "SUSPENDED",
        suspendedUntil,
        suspensionReason: body.data.reason,
        updatedByAdminId: auth.userId,
        updatedAt: now,
      })
      .where(eq(users.id, id));

    await adminAuditLog(req, auth, {
      action: "ADMIN_USER_SUSPEND",
      entityType: "User",
      entityId: id,
      metadata: {
        months: body.data.months,
        suspendedUntil: suspendedUntil.toISOString(),
        reason: body.data.reason,
      },
    });

    logEvent({
      level: "info",
      event: "admin.user_action",
      route: "/api/admin/users/[id]/suspend",
      method: "POST",
      status: 200,
      userId: auth.userId,
      code: "ADMIN_USER_SUSPEND",
      context: {
        targetUserId: id,
        months: body.data.months,
        suspendedUntil: suspendedUntil.toISOString(),
      },
    });

    return NextResponse.json({ ok: true, data: { suspendedUntil: suspendedUntil.toISOString() } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/users/[id]/suspend", { userId: auth.userId });
  }
}
