import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";
import { getLgsAuthHeader } from "@/server/lgsAuth";

export async function POST() {
  try {
    const apiOrigin = getValidatedApiOrigin();
    const authorization = await getLgsAuthHeader();
    await fetch(`${apiOrigin}/api/lgs/auth/logout`, {
      method: "POST",
      headers: { authorization },
      cache: "no-store",
    }).catch(() => null);
  } catch {
    // best-effort upstream logout
  }

  const out = NextResponse.json({ ok: true, data: { loggedOut: true } }, { status: 200 });
  out.headers.set("set-cookie", "lgs_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
  return out;
}
