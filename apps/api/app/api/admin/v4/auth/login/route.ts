import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { adminSessions } from "@/db/schema/adminSession";
import { adminUsers } from "@/db/schema/adminUser";
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

function isUndefinedTableError(e: unknown): boolean {
  const code = String((e as any)?.code ?? "");
  const msg = String((e as any)?.message ?? "").toLowerCase();
  return code === "42P01" || (msg.includes("relation") && msg.includes("does not exist"));
}

function mapLegacyRoleToV4(roleRaw: unknown): "ADMIN" | "ADMIN_SUPER" {
  const role = String(roleRaw ?? "").trim().toUpperCase();
  if (role.includes("SUPER")) return "ADMIN_SUPER";
  return "ADMIN";
}

export async function POST(req: Request) {
  const ip = requestIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const now = new Date();
  const isProxyRequest = req.headers.get("x-admin-proxy") === "true";

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

    let v4Admin:
      | {
          id: string;
          authSubjectId: string | null;
          email: string;
          role: string;
          status: string;
          passwordHash: string | null;
        }
      | null = null;
    try {
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
      v4Admin = (rows[0] as any) ?? null;
    } catch (e) {
      if (!isUndefinedTableError(e)) throw e;
    }

    let adminId = "";
    let authSubjectId = "";
    let adminEmail = parsed.email;
    let adminRole = "ADMIN";
    let adminStatus = "ACTIVE";
    let passwordHash = "";

    if (v4Admin?.id && v4Admin.authSubjectId && v4Admin.passwordHash) {
      adminId = String(v4Admin.id);
      authSubjectId = String(v4Admin.authSubjectId);
      adminEmail = String(v4Admin.email).trim().toLowerCase();
      adminRole = String(v4Admin.role ?? "ADMIN");
      adminStatus = String(v4Admin.status ?? "ACTIVE");
      passwordHash = String(v4Admin.passwordHash);
    } else {
      const legacyRows = await db
        .select({
          id: adminUsers.id,
          email: adminUsers.email,
          role: adminUsers.role,
          passwordHash: adminUsers.passwordHash,
        })
        .from(adminUsers)
        .where(eq(adminUsers.email, parsed.email))
        .limit(1);
      const legacy = legacyRows[0] ?? null;
      if (!legacy?.id || !legacy.passwordHash) {
        console.info("[ADMIN_V4_AUTH_LOGIN_FAILED]", { reason: "no_admin", email: parsed.email, ip });
        return err(401, "ADMIN_V4_UNAUTHORIZED", "Invalid credentials");
      }

      adminId = String(legacy.id);
      authSubjectId = String(legacy.id);
      adminEmail = String(legacy.email).trim().toLowerCase();
      adminRole = mapLegacyRoleToV4(legacy.role);
      adminStatus = "ACTIVE";
      passwordHash = String(legacy.passwordHash);

      // Best-effort seed/migrate into v4 table for future requests.
      try {
        const upserted = await db
          .insert(v4AdminUsers)
          .values({
            id: crypto.randomUUID(),
            authSubjectId: legacy.id,
            email: adminEmail,
            role: adminRole,
            passwordHash,
            status: "ACTIVE",
            lastLoginAt: now,
          })
          .onConflictDoUpdate({
            target: v4AdminUsers.email,
            set: {
              authSubjectId: legacy.id,
              role: adminRole,
              passwordHash,
              status: "ACTIVE",
              lastLoginAt: now,
            },
          })
          .returning({
            id: v4AdminUsers.id,
            authSubjectId: v4AdminUsers.authSubjectId,
            email: v4AdminUsers.email,
            role: v4AdminUsers.role,
            status: v4AdminUsers.status,
            passwordHash: v4AdminUsers.passwordHash,
          });
        const v4 = upserted[0] ?? null;
        if (v4?.id && v4.authSubjectId && v4.passwordHash) {
          adminId = String(v4.id);
          authSubjectId = String(v4.authSubjectId);
          adminEmail = String(v4.email).trim().toLowerCase();
          adminRole = String(v4.role ?? adminRole);
          adminStatus = String(v4.status ?? "ACTIVE");
          passwordHash = String(v4.passwordHash);
        }
      } catch (e) {
        if (!isUndefinedTableError(e)) throw e;
      }
    }

    if (!adminId || !authSubjectId || !passwordHash) {
      console.info("[ADMIN_V4_AUTH_LOGIN_FAILED]", { reason: "no_admin_materialized", email: parsed.email, ip });
      return err(401, "ADMIN_V4_UNAUTHORIZED", "Invalid credentials");
    }
    if (String(adminStatus ?? "ACTIVE").toUpperCase() !== "ACTIVE") {
      console.info("[ADMIN_V4_AUTH_LOGIN_FAILED]", { reason: "inactive", email: parsed.email, ip });
      return err(403, "ADMIN_V4_FORBIDDEN", "Admin account is not active");
    }

    const role = String(adminRole ?? "").trim().toUpperCase();
    if (!role.includes("ADMIN")) {
      console.info("[ADMIN_V4_AUTH_LOGIN_FAILED]", { reason: "non_admin_role", role, email: parsed.email, ip });
      return err(403, "ADMIN_V4_FORBIDDEN", "Admin role required");
    }

    const valid = await bcrypt.compare(parsed.password, passwordHash).catch(() => false);
    if (!valid) {
      console.info("[ADMIN_V4_AUTH_LOGIN_FAILED]", { reason: "bad_password", email: parsed.email, ip });
      return err(401, "ADMIN_V4_UNAUTHORIZED", "Invalid credentials");
    }

    const sessionToken = newAdminV4SessionToken();
    const tokenHash = sessionTokenHash(sessionToken);
    const expiresAt = adminV4ExpiresAtFromNow();

    await db.insert(adminSessions).values({
      id: crypto.randomUUID(),
      adminUserId: authSubjectId,
      sessionTokenHash: tokenHash,
      expiresAt,
    });

    try {
      await db.update(v4AdminUsers).set({ lastLoginAt: now }).where(eq(v4AdminUsers.id, adminId));
    } catch (e) {
      if (!isUndefinedTableError(e)) throw e;
    }

    console.info("[ADMIN_V4_AUTH_LOGIN_SUCCESS]", { adminId, email: adminEmail, ip });
    const res = ok({
      admin: { id: adminId, email: adminEmail, role: adminRole },
      expiresAt: expiresAt.toISOString(),
      ...(isProxyRequest ? { sessionToken } : {}),
    });
    if (!isProxyRequest) appendSessionCookie(res, sessionToken, expiresAt);
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
