import { NextResponse } from "next/server";

export async function POST() {
  const out = NextResponse.json({ ok: true, data: { loggedOut: true } }, { status: 200 });
  out.headers.set(
    "set-cookie",
    "lgs_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
  );
  return out;
}
