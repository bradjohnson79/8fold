import { requireRouterReady } from "../../../../../src/auth/requireRouterReady";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { ok } from "../../../../../src/lib/api/respond";
import { db } from "../../../../../db/drizzle";
import { and, desc, eq, isNull } from "drizzle-orm";
import { notificationDeliveries } from "../../../../../db/schema/notificationDelivery";

export async function GET(req: Request) {
  try {
    const authed = await requireRouterReady(req);
    if (authed instanceof Response) return authed;
    const router = authed;
    const rows = await db
      .select({
        id: notificationDeliveries.id,
        title: notificationDeliveries.title,
        body: notificationDeliveries.body,
        createdAt: notificationDeliveries.createdAt,
        readAt: notificationDeliveries.readAt,
        jobId: notificationDeliveries.jobId,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.userId, router.userId))
      .orderBy(desc(notificationDeliveries.createdAt))
      .limit(80);

    const unreadCountRows = await db
      .select({ c: notificationDeliveries.id })
      .from(notificationDeliveries)
      .where(and(eq(notificationDeliveries.userId, router.userId), isNull(notificationDeliveries.readAt)))
      .limit(5000);

    return ok({
      notifications: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt ? r.readAt.toISOString() : null,
      })),
      unreadCount: unreadCountRows.length,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/web/router/notifications");
  }
}

