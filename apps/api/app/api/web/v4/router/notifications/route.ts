import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { listNotifications } from "@/src/services/notifications/notificationService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const role = await requireV4Role(req, "ROUTER");
  if (role instanceof Response) return role;

  try {
    const url = new URL(req.url);
    const data = await listNotifications({
      userId: role.userId,
      role: "ROUTER",
      unreadOnly: String(url.searchParams.get("unreadOnly") ?? "").toLowerCase() === "true",
      page: Number(url.searchParams.get("page") ?? "1") || 1,
      pageSize: Number(url.searchParams.get("pageSize") ?? "25") || 25,
    });

    return NextResponse.json(
      {
        ok: true,
        notifications: data.rows,
        unreadCount: data.unreadCount,
        totalCount: data.totalCount,
        page: data.page,
        pageSize: data.pageSize,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: true, notifications: [], unreadCount: 0, totalCount: 0, page: 1, pageSize: 25 }, { status: 200 });
  }
}
