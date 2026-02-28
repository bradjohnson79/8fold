import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { listNotifications } from "@/src/services/notifications/notificationService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;

  const url = new URL(req.url);
  const data = await listNotifications({
    userId: role.userId,
    role: "JOB_POSTER",
    unreadOnly: String(url.searchParams.get("unreadOnly") ?? "").toLowerCase() === "true",
    priority: url.searchParams.get("priority"),
    type: url.searchParams.get("type"),
    entityType: url.searchParams.get("entity_type"),
    page: Number(url.searchParams.get("page") ?? "1") || 1,
    pageSize: Number(url.searchParams.get("pageSize") ?? "25") || 25,
  });

  return NextResponse.json(
    {
      notifications: data.rows,
      unreadCount: data.unreadCount,
      totalCount: data.totalCount,
      page: data.page,
      pageSize: data.pageSize,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
