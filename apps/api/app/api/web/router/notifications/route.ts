import { requireRouterReady } from "../../../../../src/auth/requireRouterReady";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { ok } from "../../../../../src/lib/api/respond";
import { listNotifications } from "@/src/services/notifications/notificationService";

export async function GET(req: Request) {
  try {
    console.warn("[NOTIFICATIONS_LEGACY_ROUTE_DEPRECATED]", {
      path: "/api/web/router/notifications",
      method: "GET",
    });
    const authed = await requireRouterReady(req);
    if (authed instanceof Response) return authed;
    const router = authed;
    const data = await listNotifications({
      userId: router.userId,
      role: "ROUTER",
      page: 1,
      pageSize: 80,
    });

    return ok({
      notifications: data.rows.map((r) => ({
        ...r,
        body: r.message,
        createdAt: r.createdAt?.toISOString?.() ?? null,
        readAt: r.readAt?.toISOString?.() ?? null,
        jobId: r.entityType === "JOB" ? r.entityId : null,
      })),
      unreadCount: data.unreadCount,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/web/router/notifications");
  }
}
