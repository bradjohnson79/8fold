import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";

export async function GET(req: Request) {
  const role = await requireV4Role(req, "ROUTER");
  if (role instanceof Response) return role;
  return NextResponse.json({ ok: true, threads: [] }, { status: 200 });
}
