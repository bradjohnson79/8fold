import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { adminUsers } from "@/db/schema/adminUser";
import { adminSessions } from "@/db/schema/adminSession";
import {
  ADMIN_SESSION_COOKIE_NAME,
  adminSessionTokenFromRequest,
  getAdminIdentityBySessionToken,
  sessionTokenHash,
} from "@/src/lib/auth/adminSession";

const BodySchema = z.object({
  currentPassword: z.string().trim().min(1),
  newPassword: z.string().trim().min(8),
});

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
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const admin = await getAdminIdentityBySessionToken(token).catch(() => null);
  if (!admin) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const rows = await db
    .select({ id: adminUsers.id, passwordHash: adminUsers.passwordHash })
    .from(adminUsers)
    .where(eq(adminUsers.id, admin.id))
    .limit(1);
  const row = rows[0] ?? null;
  if (!row?.id || !row.passwordHash) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const ok = await bcrypt.compare(parsed.data.currentPassword, String(row.passwordHash)).catch(() => false);
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const nextHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db.update(adminUsers).set({ passwordHash: nextHash }).where(eq(adminUsers.id, admin.id));

  // Revoke all sessions for this admin user (including the current one), then clear cookie.
  await db.delete(adminSessions).where(eq(adminSessions.adminUserId, admin.id));
  // Best-effort remove current session hash too (covers schema drift).
  await db.delete(adminSessions).where(eq(adminSessions.sessionTokenHash, sessionTokenHash(token)));

  const res = NextResponse.json({ ok: true }, { status: 200 });
  clearSessionCookie(res);
  return res;
}

