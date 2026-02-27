import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";
import { getAdminAuthHeader } from "@/server/adminAuth";

export async function POST(req: Request) {
  try {
    const apiOrigin = getValidatedApiOrigin();
    const authorization = await getAdminAuthHeader(req);
    await fetch(`${apiOrigin}/api/admin/auth/logout`, {
      method: "POST",
      headers: { authorization },
      cache: "no-store",
    }).catch(() => null);
  } catch {
    // best-effort upstream logout
  }

  const out = NextResponse.json({ ok: true, data: { loggedOut: true } }, { status: 200 });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  out.headers.set("set-cookie", `admin_session=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`);
  return out;
}
