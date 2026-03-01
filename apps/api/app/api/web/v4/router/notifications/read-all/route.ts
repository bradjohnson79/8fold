import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { markAllRead } from "@/src/services/v4/notifications/notificationService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const role = await requireV4Role(req, "ROUTER");
  if (role instanceof Response) return role;

  const updated = await markAllRead({
    userId: role.userId,
    role: "ROUTER",
  });
  return NextResponse.json({ ok: true, updatedCount: updated.updatedCount }, { headers: { "cache-control": "no-store" } });
}
