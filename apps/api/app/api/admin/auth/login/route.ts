import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { findAdminByEmail, getAdminJwtSecret, sessionCookie } from "@/src/lib/auth/adminSessionAuth";

type AttemptBucket = { count: number; resetAt: number };

const loginAttemptsByIp = new Map<string, AttemptBucket>();
const loginAttemptsByEmail = new Map<string, AttemptBucket>();

function consumeRateLimit(map: Map<string, AttemptBucket>, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function requestIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(req: Request) {
  const ip = requestIp(req);

  try {
    if (!consumeRateLimit(loginAttemptsByIp, ip, 20, 60_000)) {
      return NextResponse.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Too many login attempts" } },
        { status: 429 },
      );
    }

    const payload = (await req.json().catch(() => null)) as { email?: string; password?: string } | null;
    const email = String(payload?.email ?? "").trim().toLowerCase();
    const password = String(payload?.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: "Email and password are required" } },
        { status: 400 },
      );
    }

    if (password.length < 12) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: "Password must be at least 12 characters" } },
        { status: 400 },
      );
    }

    if (!consumeRateLimit(loginAttemptsByEmail, email, 10, 5 * 60_000)) {
      return NextResponse.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Too many login attempts" } },
        { status: 429 },
      );
    }

    const admin = await findAdminByEmail(email);
    if (!admin?.id || !admin.passwordHash || admin.disabledAt) {
      console.warn("[ADMIN_AUTH_LOGIN_FAILED]", { reason: "not_found_or_disabled", email, ip });
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid credentials" } },
        { status: 401 },
      );
    }

    const passwordOk = await bcrypt.compare(password, admin.passwordHash).catch(() => false);
    if (!passwordOk) {
      console.warn("[ADMIN_AUTH_LOGIN_FAILED]", { reason: "password_mismatch", email, ip });
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid credentials" } },
        { status: 401 },
      );
    }

    const role = String(admin.role ?? "STANDARD").trim().toUpperCase();
    const token = jwt.sign({ adminId: String(admin.id), role }, getAdminJwtSecret(), {
      expiresIn: "8h",
      algorithm: "HS256",
    });

    const res = NextResponse.json({ ok: true, data: { authenticated: true } }, { status: 200 });
    res.headers.set("set-cookie", sessionCookie(token));
    return res;
  } catch (error) {
    console.error("[ADMIN_AUTH_LOGIN_ERROR]", {
      ip,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Login failed" } },
      { status: 500 },
    );
  }
}
