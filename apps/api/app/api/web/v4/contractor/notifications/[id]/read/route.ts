import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { markNotificationReadById } from "@/src/services/v4/notifications/notificationService";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const role = await requireV4Role(req, "CONTRACTOR");
  if (role instanceof Response) return role;
  const { id } = await ctx.params;

  const updated = await markNotificationReadById(id, { userId: role.userId, role: "CONTRACTOR" });
  if (!updated) return NextResponse.json({ ok: false, error: "Notification not found" }, { status: 404 });
  return NextResponse.json({ ok: true, notification: updated }, { headers: { "cache-control": "no-store" } });
}
