import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { adminRouterContexts } from "../../../../db/schema/adminRouterContext";
import { toHttpError } from "../../../../src/http/errors";
import { revokeSession } from "../../../../src/auth/mobileAuth";
import { optionalUser } from "../../../../src/auth/rbac";

function parseCookieHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = rest.join("=") ?? "";
  }
  return out;
}

function getSessionToken(req: Request): string | null {
  const authz = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (authz && authz.toLowerCase().startsWith("bearer ")) {
    const token = authz.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  const header = req.headers.get("x-session-token");
  if (header && header.trim().length > 0) return header.trim();

  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const sidRaw = cookies["sid"] ?? "";
  if (!sidRaw) return null;
  try {
    const sid = decodeURIComponent(sidRaw);
    return sid && sid.trim().length > 0 ? sid.trim() : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    // Best-effort: if an admin logs out, explicitly deactivate their router context.
    const u = await optionalUser(req);
    if (u?.role === "ADMIN") {
      await db
        .update(adminRouterContexts)
        .set({ deactivatedAt: new Date() })
        .where(and(eq(adminRouterContexts.adminId, u.userId), isNull(adminRouterContexts.deactivatedAt)));
    }

    const token = getSessionToken(req);
    if (token) await revokeSession(token);

    const res = NextResponse.json({ ok: true });
    // Clear cookie for browser-based sessions.
    res.cookies.set("sid", "", {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(0),
      maxAge: 0,
    });
    return res;
  } catch (err) {
    const { status, message, code, context } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message, code, context }, { status });
  }
}

