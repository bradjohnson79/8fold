import { eq, ilike } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { db } from "@/server/db/drizzle";
import { admins } from "@/db/schema/admin";

export const ADMIN_SESSION_COOKIE_NAME = "admin_session";

type AdminJwtPayload = {
  adminId: string;
  role: string;
  iat?: number;
  exp?: number;
};

type AuthenticatedAdmin = {
  adminId: string;
  email: string;
  role: string;
};

function unauthorized(message = "Authentication required.") {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message,
      },
    },
    { status: 401 },
  );
}

function forbidden(message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message,
      },
    },
    { status: 403 },
  );
}

function readCookie(cookieHeader: string | null, name: string): string {
  const raw = cookieHeader ?? "";
  if (!raw) return "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    const value = part.slice(idx + 1).trim();
    try {
      return value ? decodeURIComponent(value) : "";
    } catch {
      return value;
    }
  }
  return "";
}

export function getAdminJwtSecret(): string {
  // Canonical admin session secret source across API/Admin projects.
  // Do not introduce fallback env vars.
  const secret = String(process.env.ADMIN_JWT_SECRET ?? "").trim();
  if (!secret) throw Object.assign(new Error("ADMIN_JWT_SECRET is required"), { status: 500 });
  return secret;
}

export function sessionCookieFor(cookieName: string, token: string): string {
  return `${cookieName}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`;
}

export function clearSessionCookieFor(cookieName: string): string {
  return `${cookieName}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export function sessionCookie(token: string): string {
  return sessionCookieFor(ADMIN_SESSION_COOKIE_NAME, token);
}

export function clearSessionCookie(): string {
  return clearSessionCookieFor(ADMIN_SESSION_COOKIE_NAME);
}

export function tokenFromRequest(req: Request): string | null {
  const authorization = String(req.headers.get("authorization") ?? "").trim();
  if (authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }

  const cookieHeader = req.headers.get("cookie");
  const adminToken = readCookie(cookieHeader, ADMIN_SESSION_COOKIE_NAME).trim();
  if (adminToken) return adminToken;

  const lgsToken = readCookie(cookieHeader, "lgs_session").trim();
  return lgsToken || null;
}

export function verifyAdminToken(token: string): AdminJwtPayload {
  const verified = jwt.verify(token, getAdminJwtSecret(), {
    algorithms: ["HS256"],
  }) as AdminJwtPayload;

  const adminId = String(verified?.adminId ?? "").trim();
  const role = String(verified?.role ?? "").trim();
  if (!adminId || !role) throw Object.assign(new Error("Invalid token payload"), { status: 401 });
  return { adminId, role, iat: verified.iat, exp: verified.exp };
}

export async function authenticateAdminRequest(req: Request): Promise<AuthenticatedAdmin | NextResponse> {
  const token = tokenFromRequest(req);
  if (!token) return unauthorized();

  let payload: AdminJwtPayload;
  try {
    payload = verifyAdminToken(token);
  } catch {
    return unauthorized();
  }

  const rows = await db
    .select({
      id: admins.id,
      email: admins.email,
      role: admins.role,
      disabledAt: admins.disabledAt,
    })
    .from(admins)
    .where(eq(admins.id, payload.adminId))
    .limit(1);

  const admin = rows[0] ?? null;
  if (!admin?.id) return unauthorized();
  if (admin.disabledAt) return forbidden("Admin account is disabled.");

  const role = String(admin.role ?? "").trim().toUpperCase();
  if (!role.startsWith("ADMIN") && role !== "STANDARD") {
    return forbidden("Admin role is required.");
  }

  return {
    adminId: String(admin.id),
    email: String(admin.email).trim().toLowerCase(),
    role,
  };
}

export async function findAdminByEmail(email: string) {
  const rows = await db
    .select({
      id: admins.id,
      email: admins.email,
      passwordHash: admins.passwordHash,
      role: admins.role,
      disabledAt: admins.disabledAt,
    })
    .from(admins)
    .where(ilike(admins.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}
