import { requireAdmin } from "@/src/adminBus";
import { markNotificationReadById } from "@/src/services/notifications/notificationService";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdmin(req);
  if (authed instanceof Response) return authed;

  const { id } = await ctx.params;
  const updated = await markNotificationReadById(id, {
    userId: authed.adminId,
  });
  if (!updated) return err(404, "ADMIN_V4_NOTIFICATION_NOT_FOUND", "Notification not found");

  return ok({ notification: updated });
}
