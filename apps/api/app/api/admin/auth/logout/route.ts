import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/src/lib/auth/adminSessionAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true, data: { loggedOut: true } }, { status: 200 });
  res.headers.set("set-cookie", clearSessionCookie());
  return res;
}
