import { requireAdminIdentity } from "@/src/adminBus/auth";
import { markAllRead } from "@/src/services/v4/notifications/notificationService";
import { ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const authed = await requireAdminIdentity(req);
  if (authed instanceof Response) return authed;

  const updated = await markAllRead({
    userId: authed.adminId,
    role: "ADMIN",
  });

  return ok({ updatedCount: updated.updatedCount });
}
