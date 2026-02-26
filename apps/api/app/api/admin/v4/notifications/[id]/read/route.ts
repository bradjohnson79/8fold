import { and, eq, or } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4Notifications } from "@/db/schema/v4Notification";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id } = await ctx.params;

  const rows = await db
    .update(v4Notifications)
    .set({ read: true })
    .where(
      and(
        eq(v4Notifications.id, id),
        or(eq(v4Notifications.userId, authed.adminId), eq(v4Notifications.role, "ADMIN")),
      ),
    )
    .returning();

  const updated = rows[0] ?? null;
  if (!updated) return err(404, "ADMIN_V4_NOTIFICATION_NOT_FOUND", "Notification not found");

  return ok({ notification: updated });
}
