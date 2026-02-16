import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { adminUsers } from "@/db/schema/adminUser";
import { adminSessions } from "@/db/schema/adminSession";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ensureAdminSessionsTable,
  expiresAtFromNow,
  newAdminSessionToken,
  sessionTokenHash,
} from "@/src/lib/auth/adminSession";
import { logEvent } from "@/src/server/observability/log";

const BodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().trim().min(1),
});

function setSessionCookie(res: NextResponse, token: string, expiresAt: Date) {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
    secure ? "Secure" : null,
  ].filter(Boolean);
  res.headers.append("Set-Cookie", parts.join("; "));
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  try {
    await ensureAdminSessionsTable();

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return unauthorized();

    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    const rows = await db
      .select({ id: adminUsers.id, email: adminUsers.email, passwordHash: adminUsers.passwordHash, role: adminUsers.role })
      .from(adminUsers)
      .where(eq(adminUsers.email, email))
      .limit(1);
    const admin = rows[0] ?? null;
    if (!admin?.id || !admin.passwordHash) return unauthorized();

    const ok = await bcrypt.compare(password, String(admin.passwordHash)).catch(() => false);
    if (!ok) return unauthorized();

    const token = newAdminSessionToken();
    const tokenHash = sessionTokenHash(token);
    const expiresAt = expiresAtFromNow();
    const sessionId = crypto.randomUUID();

    await db.insert(adminSessions).values({
      id: sessionId,
      adminUserId: admin.id,
      sessionTokenHash: tokenHash,
      expiresAt,
    });

    const res = NextResponse.json(
      { ok: true, data: { admin: { id: String(admin.id), email: String(admin.email), role: String(admin.role ?? "ADMIN") } } },
      { status: 200 },
    );
    setSessionCookie(res, token, expiresAt);
    return res;
  } catch (err) {
    logEvent({
      level: "error",
      event: "admin.login_error",
      route: "/api/admin/login",
      method: "POST",
      status: 401,
      code: "UNAUTHORIZED",
    });
    return unauthorized();
  }
}

