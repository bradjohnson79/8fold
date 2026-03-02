import { z } from "zod";
import { requireAdminIdentity } from "@/src/adminBus/auth";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getPreferences, updatePreferences } from "@/src/services/v4/notifications/notificationService";

const BodySchema = z.object({
  items: z.array(
    z.object({
      type: z.string().trim().min(1),
      inApp: z.boolean().optional(),
      email: z.boolean().optional(),
    }),
  ),
});

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireAdminIdentity(req);
  if (authed instanceof Response) return authed;

  const prefs = await getPreferences({
    userId: authed.adminId,
    role: "ADMIN",
  });
  return ok(prefs);
}

export async function PATCH(req: Request) {
  const authed = await requireAdminIdentity(req);
  if (authed instanceof Response) return authed;

  const body = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return err(400, "ADMIN_V4_INVALID_NOTIFICATION_PREFERENCES", "Invalid preferences payload");

  const prefs = await updatePreferences({
    userId: authed.adminId,
    role: "ADMIN",
    items: body.data.items,
  });
  return ok(prefs);
}
