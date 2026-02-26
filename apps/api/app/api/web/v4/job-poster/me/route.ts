import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";

/**
 * V4 bootstrap/session check for job poster dashboard.
 * Returns minimal { ok, superuser } — no legacy /api/app/me dependency.
 */
export async function GET(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;
  return NextResponse.json({ ok: true, superuser: false });
}
