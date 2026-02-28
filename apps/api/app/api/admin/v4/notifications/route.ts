import { requireAdminIdentity } from "@/src/adminBus/auth";
import { listNotifications } from "@/src/services/notifications/notificationService";
import { ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireAdminIdentity(req);
  if (authed instanceof Response) return authed;

  try {
    const { searchParams } = new URL(req.url);
    const priority = String(searchParams.get("priority") ?? "").trim();
    const type = String(searchParams.get("type") ?? "").trim();
    const entityType = String(searchParams.get("entity_type") ?? "").trim();
    const read = String(searchParams.get("read") ?? "").trim();
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.max(1, Math.min(100, Number(searchParams.get("pageSize") ?? "25") || 25));

    const readState = read === "true" ? true : read === "false" ? false : null;
    const data = await listNotifications({
      userId: authed.adminId,
      read: readState,
      priority: priority || null,
      type: type || null,
      entityType: entityType || null,
      page,
      pageSize,
    });

    return ok({
      notifications: data.rows,
      rows: data.rows,
      totalCount: data.totalCount,
      unreadCount: data.unreadCount,
      page: data.page,
      pageSize: data.pageSize,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "ADMIN_V4_NOTIFICATIONS_FAILED",
          message: error instanceof Error ? error.message : "Failed to load notifications",
        },
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
