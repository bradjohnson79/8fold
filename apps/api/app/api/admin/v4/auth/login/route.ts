import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { adminSessions } from "@/db/schema/adminSession";
import { v4AdminUsers } from "@/db/schema/v4AdminUser";
import { adminV4ExpiresAtFromNow, appendSessionCookie, newAdminV4SessionToken, sessionTokenHash } from "@/src/auth/adminV4Session";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { rateLimitOrThrow } from "@/src/services/v4/rateLimitService";
import { V4Error } from "@/src/services/v4/v4Errors";

function requestIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function parseCredentials(raw: string): { email: string; password: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    const obj = JSON.parse(trimmed) as { email?: string; password?: string };
    const email = String(obj.email ?? "").trim().toLowerCase();
    const password = String(obj.password ?? "");
    if (!email || !password) return null;
    return { email, password };
  }

  const params = new URLSearchParams(trimmed);
  const email = String(params.get("email") ?? "").trim().toLowerCase();
  const password = String(params.get("password") ?? "");
  if (!email || !password) return null;
  return { email, password };
}

export async function POST(req: Request) {
  const ip = requestIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const now = new Date();

  try {
    await rateLimitOrThrow({
      key: `admin_v4_auth:login:ip:${ip}`,
      windowSeconds: 60,
      max: 30,
    });

    const raw = await req.text().catch(() => "");
    const parsed = parseCredentials(raw);
    if (!parsed) {
      console.info("[ADMIN_V4_AUTH_LOGIN_INVALID_PAYLOAD]", { ip, ua });
      return err(400, "ADMIN_V4_INVALID_REQUEST", "Invalid login payload");
    }

    await rateLimitOrThrow({
      key: `admin_v4_auth:login:email:${parsed.email}`,
      windowSeconds: 300,
      max: 20,
    });

    const rows = await db
      .select({
        id: v4AdminUsers.id,
        authSubjectId: v4AdminUsers.authSubjectId,
        email: v4AdminUsers.email,
        role: v4AdminUsers.role,
        status: v4AdminUsers.status,
        passwordHash: v4AdminUsers.passwordHash,
      })
      .from(v4AdminUsers)
      .where(eq(v4AdminUsers.email, parsed.email))
      .limit(1);

    const admin = rows[0] ?? null;
    if (!admin?.id || !admin.passwordHash || !admin.authSubjectId) {
      console.info("[ADMIN_V4_AUTH_LOGIN_FAILED]", { reason: "no_admin", email: parsed.email, ip });
      return err(401, "ADMIN_V4_UNAUTHORIZED", "Invalid credentials");
    }
    if (String(admin.status ?? "ACTIVE").toUpperCase() !== "ACTIVE") {
      console.info("[ADMIN_V4_AUTH_LOGIN_FAILED]", { reason: "inactive", email: parsed.email, ip });
      return err(403, "ADMIN_V4_FORBIDDEN", "Admin account is not active");
    }

    const role = String(admin.role ?? "").trim().toUpperCase();
    if (!role.startsWith("ADMIN")) {
      console.info("[ADMIN_V4_AUTH_LOGIN_FAILED]", { reason: "non_admin_role", role, email: parsed.email, ip });
      return err(403, "ADMIN_V4_FORBIDDEN", "Admin role required");
    }

    const valid = await bcrypt.compare(parsed.password, String(admin.passwordHash)).catch(() => false);
    if (!valid) {
      console.info("[ADMIN_V4_AUTH_LOGIN_FAILED]", { reason: "bad_password", email: parsed.email, ip });
      return err(401, "ADMIN_V4_UNAUTHORIZED", "Invalid credentials");
    }

    const sessionToken = newAdminV4SessionToken();
    const tokenHash = sessionTokenHash(sessionToken);
    const expiresAt = adminV4ExpiresAtFromNow();

    await db.insert(adminSessions).values({
      id: crypto.randomUUID(),
      adminUserId: admin.authSubjectId,
      sessionTokenHash: tokenHash,
      expiresAt,
    });

    await db.update(v4AdminUsers).set({ lastLoginAt: now }).where(eq(v4AdminUsers.id, admin.id));

    console.info("[ADMIN_V4_AUTH_LOGIN_SUCCESS]", { adminId: admin.id, email: admin.email, ip });
    const res = ok({ admin: { id: admin.id, email: admin.email, role: admin.role }, expiresAt: expiresAt.toISOString() });
    appendSessionCookie(res, sessionToken, expiresAt);
    return res;
  } catch (e) {
    if (e instanceof V4Error && e.status === 429) {
      console.info("[ADMIN_V4_AUTH_LOGIN_RATE_LIMITED]", { ip, ua });
      return err(429, e.code || "ADMIN_V4_RATE_LIMITED", e.message || "Too many requests");
    }
    console.error("[ADMIN_V4_AUTH_LOGIN_ERROR]", { message: e instanceof Error ? e.message : String(e), ip, ua });
    return err(500, "ADMIN_V4_INTERNAL_ERROR", "Failed to login");
  }
}
