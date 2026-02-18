import crypto from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { adminUsers } from "@/db/schema/adminUser";
import { adminSessions } from "@/db/schema/adminSession";

export const ADMIN_SESSION_COOKIE_NAME = "admin_session";
const SESSION_DAYS = 30;

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function cookieValueFromHeader(cookieHeader: string | null, name: string): string {
  const raw = cookieHeader ?? "";
  if (!raw) return "";
  // Small cookie parser (no dependencies).
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    const v = part.slice(idx + 1).trim();
    try {
      return v ? decodeURIComponent(v) : "";
    } catch {
      return v;
    }
  }
  return "";
}

export function adminSessionTokenFromRequest(req: Request): string | null {
  const token = cookieValueFromHeader(req.headers.get("cookie"), ADMIN_SESSION_COOKIE_NAME);
  const t = String(token ?? "").trim();
  return t ? t : null;
}

export function newAdminSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function expiresAtFromNow(): Date {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export function sessionTokenHash(token: string): string {
  return sha256(String(token ?? "").trim());
}

let ensured: Promise<void> | null = null;
export async function ensureAdminSessionsTable(): Promise<void> {
  // Keep this minimal and dev-friendly. In production this should be created via migrations.
  if (ensured) return await ensured;
  ensured = (async () => {
    await db.execute(sql`
      create table if not exists "admin_sessions" (
        "id" text primary key,
        "adminUserId" uuid not null,
        "sessionTokenHash" text not null unique,
        "expiresAt" timestamptz not null,
        "createdAt" timestamptz not null default now()
      );
    `);
    await db.execute(sql`create index if not exists "admin_sessions_adminUserId_idx" on "admin_sessions" ("adminUserId");`);
    await db.execute(sql`create index if not exists "admin_sessions_expiresAt_idx" on "admin_sessions" ("expiresAt");`);
  })();
  return await ensured;
}

export type AdminIdentity = {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
  fullName: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
};

export async function getAdminIdentityBySessionToken(token: string): Promise<AdminIdentity | null> {
  await ensureAdminSessionsTable();
  const raw = String(token ?? "").trim();
  if (!raw) return null;

  const hash = sessionTokenHash(raw);
  const now = new Date();

  // Join session -> admin user.
  const rows = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      role: adminUsers.role,
      createdAt: adminUsers.createdAt,
      fullName: adminUsers.fullName,
      country: adminUsers.country,
      state: adminUsers.state,
      city: adminUsers.city,
      address: adminUsers.address,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
    .where(and(eq(adminSessions.sessionTokenHash, hash), gt(adminSessions.expiresAt, now)))
    .limit(1);

  const r = rows[0] ?? null;
  if (!r?.id) return null;
  return {
    id: String(r.id),
    email: String(r.email),
    role: String(r.role ?? "ADMIN"),
    createdAt: r.createdAt,
    fullName: r.fullName ?? null,
    country: r.country ?? null,
    state: r.state ?? null,
    city: r.city ?? null,
    address: r.address ?? null,
  };
}

export async function revokeAdminSessionToken(token: string): Promise<void> {
  await ensureAdminSessionsTable();
  const raw = String(token ?? "").trim();
  if (!raw) return;
  const hash = sessionTokenHash(raw);
  await db.delete(adminSessions).where(eq(adminSessions.sessionTokenHash, hash));
}

