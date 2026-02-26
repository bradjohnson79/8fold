import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { adminSessions } from "@/db/schema/adminSession";
import { v4AdminUsers } from "@/db/schema/v4AdminUser";
import { v4AdminBootstrapTokens } from "@/db/schema/v4AdminBootstrapToken";
import { v4AdminInviteTokens } from "@/db/schema/v4AdminInviteToken";
import { adminV4ExpiresAtFromNow, appendSessionCookie, newAdminV4SessionToken, sessionTokenHash } from "@/src/auth/adminV4Session";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { rateLimitOrThrow } from "@/src/services/v4/rateLimitService";
import { V4Error } from "@/src/services/v4/v4Errors";

const BodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().trim().min(8),
  bootstrapToken: z.string().trim().min(8).optional(),
  inviteToken: z.string().trim().min(8).optional(),
});

function hashToken(v: string): string {
  return crypto.createHash("sha256").update(String(v).trim()).digest("hex");
}

function requestIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(req: Request) {
  const ip = requestIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const now = new Date();
  const isProxyRequest = req.headers.get("x-admin-proxy") === "true";

  try {
    await rateLimitOrThrow({
      key: `admin_v4_auth:bootstrap:ip:${ip}`,
      windowSeconds: 60,
      max: 20,
    });

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      console.info("[ADMIN_V4_AUTH_BOOTSTRAP_INVALID_PAYLOAD]", { ip, ua });
      return err(400, "ADMIN_V4_INVALID_REQUEST", "Invalid bootstrap payload");
    }

    const email = parsed.data.email.trim().toLowerCase();

    await rateLimitOrThrow({
      key: `admin_v4_auth:bootstrap:email:${email}`,
      windowSeconds: 600,
      max: 10,
    });

    const adminCountRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(v4AdminUsers)
      .where(sql`upper(${v4AdminUsers.role}) like 'ADMIN%'`);
    const adminCount = Number(adminCountRows[0]?.count ?? 0);
    const isFirstAdmin = adminCount === 0;

    if (isFirstAdmin && !parsed.data.bootstrapToken) {
      console.info("[ADMIN_V4_AUTH_BOOTSTRAP_REJECTED]", { reason: "bootstrap_token_required", email, ip });
      return err(403, "ADMIN_V4_BOOTSTRAP_TOKEN_REQUIRED", "Bootstrap token required");
    }
    if (!isFirstAdmin && !parsed.data.inviteToken) {
      console.info("[ADMIN_V4_AUTH_BOOTSTRAP_REJECTED]", { reason: "invite_token_required", email, ip });
      return err(403, "ADMIN_V4_INVITE_TOKEN_REQUIRED", "Invite token required");
    }

    if (isFirstAdmin) {
      const tokenHash = hashToken(parsed.data.bootstrapToken ?? "");
      const tokenRows = await db
        .select({ id: v4AdminBootstrapTokens.id })
        .from(v4AdminBootstrapTokens)
        .where(and(eq(v4AdminBootstrapTokens.tokenHash, tokenHash), isNull(v4AdminBootstrapTokens.usedAt), gt(v4AdminBootstrapTokens.expiresAt, now)))
        .limit(1);
      if (!tokenRows[0]?.id) {
        console.info("[ADMIN_V4_AUTH_BOOTSTRAP_REJECTED]", { reason: "bootstrap_token_invalid", email, ip });
        return err(403, "ADMIN_V4_BOOTSTRAP_TOKEN_INVALID", "Invalid bootstrap token");
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const rows = await db
        .insert(v4AdminUsers)
        .values({
          id: crypto.randomUUID(),
          authSubjectId: crypto.randomUUID(),
          email,
          role: "ADMIN_SUPER",
          passwordHash,
          status: "ACTIVE",
          lastLoginAt: now,
        })
        .onConflictDoUpdate({
          target: v4AdminUsers.email,
          set: { role: "ADMIN_SUPER", passwordHash, status: "ACTIVE", lastLoginAt: now },
        })
        .returning({ id: v4AdminUsers.id, authSubjectId: v4AdminUsers.authSubjectId, email: v4AdminUsers.email, role: v4AdminUsers.role });
      const admin = rows[0]!;

      await db.update(v4AdminBootstrapTokens).set({ usedAt: now }).where(eq(v4AdminBootstrapTokens.id, tokenRows[0]!.id));

      const sessionToken = newAdminV4SessionToken();
      const expiresAt = adminV4ExpiresAtFromNow();
      await db.insert(adminSessions).values({
        id: crypto.randomUUID(),
        adminUserId: admin.authSubjectId!,
        sessionTokenHash: sessionTokenHash(sessionToken),
        expiresAt,
      });

      console.info("[ADMIN_V4_AUTH_BOOTSTRAP_SUCCESS]", { mode: "INITIAL", adminId: admin.id, email, ip });
      const res = ok({
        admin: { id: admin.id, email: admin.email, role: admin.role },
        expiresAt: expiresAt.toISOString(),
        bootstrapMode: "INITIAL",
        ...(isProxyRequest ? { sessionToken } : {}),
      });
      if (!isProxyRequest) appendSessionCookie(res, sessionToken, expiresAt);
      return res;
    }

    const inviteHash = hashToken(parsed.data.inviteToken ?? "");
    const inviteRows = await db
      .select({ id: v4AdminInviteTokens.id, email: v4AdminInviteTokens.email })
      .from(v4AdminInviteTokens)
      .where(and(eq(v4AdminInviteTokens.tokenHash, inviteHash), isNull(v4AdminInviteTokens.usedAt), gt(v4AdminInviteTokens.expiresAt, now)))
      .limit(1);
    const invite = inviteRows[0] ?? null;
    if (!invite?.id) {
      console.info("[ADMIN_V4_AUTH_BOOTSTRAP_REJECTED]", { reason: "invite_token_invalid", email, ip });
      return err(403, "ADMIN_V4_INVITE_TOKEN_INVALID", "Invalid invite token");
    }
    if (String(invite.email).trim().toLowerCase() !== email) {
      console.info("[ADMIN_V4_AUTH_BOOTSTRAP_REJECTED]", { reason: "invite_email_mismatch", email, ip });
      return err(403, "ADMIN_V4_INVITE_EMAIL_MISMATCH", "Invite token email mismatch");
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const rows = await db
      .insert(v4AdminUsers)
      .values({
        id: crypto.randomUUID(),
        authSubjectId: crypto.randomUUID(),
        email,
        role: "ADMIN",
        passwordHash,
        status: "ACTIVE",
        lastLoginAt: now,
      })
      .onConflictDoUpdate({
        target: v4AdminUsers.email,
        set: { role: "ADMIN", passwordHash, status: "ACTIVE", lastLoginAt: now },
      })
      .returning({ id: v4AdminUsers.id, authSubjectId: v4AdminUsers.authSubjectId, email: v4AdminUsers.email, role: v4AdminUsers.role });
    const admin = rows[0]!;

    await db.update(v4AdminInviteTokens).set({ usedAt: now }).where(eq(v4AdminInviteTokens.id, invite.id));

    const sessionToken = newAdminV4SessionToken();
    const expiresAt = adminV4ExpiresAtFromNow();
    await db.insert(adminSessions).values({
      id: crypto.randomUUID(),
      adminUserId: admin.authSubjectId!,
      sessionTokenHash: sessionTokenHash(sessionToken),
      expiresAt,
    });

    console.info("[ADMIN_V4_AUTH_BOOTSTRAP_SUCCESS]", { mode: "INVITE", adminId: admin.id, email, ip });
    const res = ok({
      admin: { id: admin.id, email: admin.email, role: admin.role },
      expiresAt: expiresAt.toISOString(),
      bootstrapMode: "INVITE",
      ...(isProxyRequest ? { sessionToken } : {}),
    });
    if (!isProxyRequest) appendSessionCookie(res, sessionToken, expiresAt);
    return res;
  } catch (e) {
    if (e instanceof V4Error && e.status === 429) {
      console.info("[ADMIN_V4_AUTH_BOOTSTRAP_RATE_LIMITED]", { ip, ua });
      return err(429, e.code || "ADMIN_V4_RATE_LIMITED", e.message || "Too many requests");
    }
    console.error("[ADMIN_V4_AUTH_BOOTSTRAP_ERROR]", { message: e instanceof Error ? e.message : String(e), ip, ua });
    return err(500, "ADMIN_V4_INTERNAL_ERROR", "Failed to process bootstrap");
  }
}
