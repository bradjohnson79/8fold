import { NextResponse } from "next/server";
import { adminSessionTokenFromRequest, ADMIN_SESSION_COOKIE_NAME, revokeAdminSessionToken } from "@/src/lib/auth/adminSession";

function clearSessionCookie(res: NextResponse) {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${ADMIN_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    secure ? "Secure" : null,
  ].filter(Boolean);
  res.headers.append("Set-Cookie", parts.join("; "));
}

export async function POST(req: Request) {
  const token = adminSessionTokenFromRequest(req);
  if (token) {
    try {
      await revokeAdminSessionToken(token);
    } catch {
      // best-effort
    }
  }
  const res = NextResponse.json({ ok: true }, { status: 200 });
  clearSessionCookie(res);
  return res;
}

