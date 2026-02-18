import crypto from "crypto";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../db/schema/auditLog";
import { users } from "../../db/schema/user";
import { eq, sql } from "drizzle-orm";
import { getAuthMode } from "./authMode";
import { sendLoginCodeEmail } from "./sendLoginCodeEmail";
import { logEvent } from "../server/observability/log";

function getAuthDbSchema(): string | null {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : null;
  } catch {
    return null;
  }
}

const AUTH_SCHEMA = getAuthDbSchema() ?? "public";
const AUTH_TOKEN_T = sql.raw(`"${AUTH_SCHEMA}"."AuthToken"`);
const SESSION_T = sql.raw(`"${AUTH_SCHEMA}"."Session"`);
const USER_T = sql.raw(`"${AUTH_SCHEMA}"."User"`);

function asDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  // Fall back to Date ctor's coercion for unexpected types.
  return new Date(v as any);
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function randomDigits(len: number): string {
  // deterministic length, 0-padded
  const max = 10 ** len;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(len, "0");
}

export async function requestLoginCode(emailRaw: string): Promise<{
  ok: true;
  debugCode?: string;
}> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) throw Object.assign(new Error("Invalid email"), { status: 400 });

  const authMode = getAuthMode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const userUpsertId = crypto.randomUUID();
  const userRes = await db.execute(sql`
    insert into ${USER_T} ("id", "email", "role")
    values (${userUpsertId}, ${email}, ${"JOB_POSTER"})
    on conflict ("email") do update set "email" = excluded."email"
    returning "id"
  `);
  const userId = (userRes.rows[0]?.id ?? null) as string | null;
  if (!userId) throw Object.assign(new Error("User missing"), { status: 500 });

  // Dev auth: still returns debugCode, but must support concurrency/load.
  const maxAttempts = 6;

  let code = randomDigits(6);
  let tokenHash = sha256(code);
  let inserted = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      code = randomDigits(6);
      tokenHash = sha256(code);
    }
    try {
      const authTokenId = crypto.randomUUID();
      await db.execute(sql`
        insert into ${AUTH_TOKEN_T} ("id", "userId", "tokenHash", "expiresAt")
        values (${authTokenId}, ${userId}, ${tokenHash}, ${expiresAt})
      `);
      inserted = true;
      break;
    } catch (e) {
      // If the DB enforces tokenHash uniqueness, retry with a new code.
      void e;
    }
  }
  if (!inserted) throw Object.assign(new Error("Could not create auth token"), { status: 500 });

  const auditId = crypto.randomUUID();
  await db.insert(auditLogs).values({
    id: auditId,
    actorUserId: userId,
    action: "AUTH_REQUESTED",
    entityType: "User",
    entityId: userId,
    metadata: { email }
  });

  // Delivery behavior is environment-specific, but storage is identical in all modes.
  if (authMode === "dev") {
    // Dev-only: code is returned in HTTP response when allowed; avoid logging secrets.
    logEvent({
      level: "info",
      event: "auth.dev_code_issued",
      route: "/api/auth/request",
      method: "POST",
      status: 200,
      context: { email, codeLength: code.length },
    });
    return { ok: true, debugCode: code };
  }

  // Production: email delivery only, never log or expose the code.
  await sendLoginCodeEmail({ toEmail: email, code });
  return { ok: true };
}

export async function verifyLoginCode(codeRaw: string): Promise<{
  ok: true;
  sessionToken: string;
  user: { id: string; email: string | null; role: string };
  expiresAt: string;
}> {
  const code = codeRaw.trim();
  if (!code) throw Object.assign(new Error("Invalid token"), { status: 400 });

  const tokenHash = sha256(code);
  const tokenRes = await db.execute(sql`
    select "id", "userId", "expiresAt", "usedAt"
    from ${AUTH_TOKEN_T}
    where "tokenHash" = ${tokenHash}
    limit 1
  `);
  const tokenRow = (tokenRes.rows[0] ?? null) as
    | { id: string; userId: string; expiresAt: unknown; usedAt: unknown | null }
    | null;
  const token = tokenRow
    ? {
        id: tokenRow.id,
        userId: tokenRow.userId,
        expiresAt: asDate(tokenRow.expiresAt),
        usedAt: tokenRow.usedAt ? asDate(tokenRow.usedAt) : null,
      }
    : null;
  if (!token) throw Object.assign(new Error("Invalid token"), { status: 401 });
  if (token.usedAt) throw Object.assign(new Error("Token already used"), { status: 409 });
  if (token.expiresAt.getTime() <= Date.now()) throw Object.assign(new Error("Token expired"), { status: 401 });

  const sessionToken = crypto.randomBytes(32).toString("hex");
  const sessionTokenHash = sha256(sessionToken);
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [session, user] = await db.transaction(async (tx) => {
    await tx.execute(sql`update ${AUTH_TOKEN_T} set "usedAt" = ${new Date()} where "id" = ${token.id}`);

    const sessionId = crypto.randomUUID();
    const sessionRes = await tx.execute(sql`
      insert into ${SESSION_T} ("id", "userId", "sessionTokenHash", "expiresAt")
      values (${sessionId}, ${token.userId}, ${sessionTokenHash}, ${sessionExpiresAt})
      returning "id", "expiresAt"
    `);
    const sessionRow = (sessionRes.rows[0] ?? null) as { id: string; expiresAt: unknown } | null;
    const session = sessionRow ? { id: sessionRow.id, expiresAt: asDate(sessionRow.expiresAt) } : null;
    if (!session) throw Object.assign(new Error("Session missing"), { status: 500 });

    const userRows = await tx
      .select({ id: users.id, email: users.email, role: users.role, status: users.status, suspendedUntil: users.suspendedUntil })
      .from(users)
      .where(sql`${users.id} = ${token.userId}`)
      .limit(1);
    const user = userRows[0] ?? null;
    if (!user) throw Object.assign(new Error("User missing"), { status: 500 });

    const status = String(user.status ?? "ACTIVE");
    const suspendedUntil = user.suspendedUntil ? (user.suspendedUntil instanceof Date ? user.suspendedUntil : new Date(user.suspendedUntil)) : null;
    if (status === "ARCHIVED") {
      throw Object.assign(new Error("Account archived"), { status: 401 });
    }
    if (status === "SUSPENDED" && suspendedUntil && suspendedUntil.getTime() > Date.now()) {
      throw Object.assign(new Error("Account suspended"), { status: 401 });
    }
    if (status === "SUSPENDED" && (!suspendedUntil || suspendedUntil.getTime() <= Date.now())) {
      await tx.update(users).set({ status: "ACTIVE", suspendedUntil: null, suspensionReason: null, updatedAt: new Date() }).where(eq(users.id, token.userId));
    }

    const authVerifiedAuditId = crypto.randomUUID();
    await tx.insert(auditLogs).values({
      id: authVerifiedAuditId,
      actorUserId: user.id,
      action: "AUTH_VERIFIED",
      entityType: "AuthToken",
      entityId: token.id,
      metadata: {}
    });
    const sessionCreatedAuditId = crypto.randomUUID();
    await tx.insert(auditLogs).values({
      id: sessionCreatedAuditId,
      actorUserId: user.id,
      action: "SESSION_CREATED",
      entityType: "Session",
      entityId: session.id,
      metadata: { expiresAt: sessionExpiresAt.toISOString() }
    });

    return [session, user] as const;
  });

  return {
    ok: true,
    sessionToken,
    user: { id: user.id, email: user.email, role: user.role },
    expiresAt: session.expiresAt.toISOString()
  };
}

export async function revokeSession(sessionToken: string): Promise<{ ok: true }> {
  const tokenHash = sha256(sessionToken);
  const sRes = await db.execute(sql`
    select "id", "userId", "revokedAt"
    from ${SESSION_T}
    where "sessionTokenHash" = ${tokenHash}
    limit 1
  `);
  const sRow = (sRes.rows[0] ?? null) as { id: string; userId: string; revokedAt: unknown | null } | null;
  const s = sRow ? { id: sRow.id, userId: sRow.userId, revokedAt: sRow.revokedAt ? asDate(sRow.revokedAt) : null } : null;
  if (!s) return { ok: true };
  if (s.revokedAt) return { ok: true };
  await db.execute(sql`update ${SESSION_T} set "revokedAt" = ${new Date()} where "id" = ${s.id}`);
  const revokedAuditId = crypto.randomUUID();
  await db.insert(auditLogs).values({
    id: revokedAuditId,
    actorUserId: s.userId,
    action: "SESSION_REVOKED",
    entityType: "Session",
    entityId: s.id,
    metadata: {}
  });
  return { ok: true };
}

