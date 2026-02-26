import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";

/**
 * V4 mark notifications read. Stub for bell UX.
 */
export async function POST(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;
  return NextResponse.json({ ok: true });
}
