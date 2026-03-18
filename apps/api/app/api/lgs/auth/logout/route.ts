import { NextResponse } from "next/server";
import { clearSessionCookieFor } from "@/src/lib/auth/adminSessionAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true, data: { loggedOut: true } }, { status: 200 });
  res.headers.set("set-cookie", clearSessionCookieFor("lgs_session"));
  return res;
}
