import { NextResponse } from "next/server";
import { requireJobPosterReady } from "../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../src/http/errors";
import { listNotifications } from "@/src/services/notifications/notificationService";

export async function GET(req: Request) {
  try {
    console.warn("[NOTIFICATIONS_LEGACY_ROUTE_DEPRECATED]", {
      path: "/api/web/job-poster/notifications",
      method: "GET",
    });
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;
    const data = await listNotifications({
      userId: u.userId,
      role: "JOB_POSTER",
      page: 1,
      pageSize: 80,
    });

    return NextResponse.json({
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
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
