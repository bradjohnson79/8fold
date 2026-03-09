import { requireAdminIdentity } from "@/src/adminBus/auth";
import { listDeliveryLogs } from "@/src/services/v4/notifications/notificationDeliveryLogService";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireAdminIdentity(req);
  if (authed instanceof Response) return authed;

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.max(1, Math.min(200, Number(searchParams.get("pageSize") ?? "50") || 50));
    const channel = searchParams.get("channel") || null;
    const status = searchParams.get("status") || null;
    const notificationType = searchParams.get("type") || null;
    const recipientUserId = searchParams.get("userId") || null;
    const since = searchParams.get("since") ? new Date(searchParams.get("since")!) : null;
    const until = searchParams.get("until") ? new Date(searchParams.get("until")!) : null;
    const isTestParam = searchParams.get("isTest");
    const isTest = isTestParam === "true" ? true : isTestParam === "false" ? false : null;

    const result = await listDeliveryLogs({
      page,
      pageSize,
      channel,
      status,
      notificationType,
      recipientUserId,
      since,
      until,
      isTest,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[ADMIN_API] notification-delivery-logs GET failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load delivery logs" },
      { status: 500 },
    );
  }
}
