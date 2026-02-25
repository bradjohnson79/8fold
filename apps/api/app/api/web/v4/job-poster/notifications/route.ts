import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";

/**
 * V4 notifications for job poster dashboard bell.
 * Stub: returns empty list. Future: wire to v4_notifications or similar.
 */
export async function GET(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;
  return NextResponse.json({ notifications: [], unreadCount: 0 });
}
