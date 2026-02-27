import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { db } from "@/server/db/drizzle";
import { admins } from "@/db/schema/admin";

type AttemptBucket = { count: number; resetAt: number };

const signupAttemptsByIp = new Map<string, AttemptBucket>();

function requestIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

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

function creationTokenValid(input: string): boolean {
  const provided = input.trim();
  if (!provided) return false;

  const configured = String(process.env.ADMIN_CREATION_TOKEN ?? "").trim();
  if (!configured) return false;
  return provided === configured;
}

function validRole(input: string): string {
  const role = input.trim().toUpperCase();
  if (role === "ADMIN_VIEWER" || role === "ADMIN_OPERATOR" || role === "ADMIN_SUPER") return role;
  return "ADMIN_OPERATOR";
}

export async function POST(req: Request) {
  const ip = requestIp(req);

  try {
    if (!consumeRateLimit(signupAttemptsByIp, ip, 10, 60_000)) {
      return NextResponse.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Too many attempts" } },
        { status: 429 },
      );
    }

    const payload = (await req.json().catch(() => null)) as {
      email?: string;
      password?: string;
      role?: string;
      tokenCode?: string;
    } | null;

    const email = String(payload?.email ?? "").trim().toLowerCase();
    const password = String(payload?.password ?? "");
    const role = validRole(String(payload?.role ?? "ADMIN_OPERATOR"));
    const tokenCode = String(payload?.tokenCode ?? "");

    if (!email || !password || !tokenCode) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: "Email, password, and token code are required" } },
        { status: 400 },
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid email" } },
        { status: 400 },
      );
    }

    if (password.length < 12) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: "Password must be at least 12 characters" } },
        { status: 400 },
      );
    }

    if (!creationTokenValid(tokenCode)) {
      console.warn("[ADMIN_BOOTSTRAP_DENIED]", { reason: "invalid_token", email, ip });
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Invalid token code" } },
        { status: 403 },
      );
    }

    const hash = await bcrypt.hash(password, 10);

    const created = await db
      .insert(admins)
      .values({
        email,
        passwordHash: hash,
        role,
      })
      .onConflictDoNothing({ target: admins.email })
      .returning({ id: admins.id, email: admins.email, role: admins.role });

    if (!created[0]?.id) {
      return NextResponse.json(
        { ok: false, error: { code: "CONFLICT", message: "Admin email already exists" } },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          created: true,
          admin: created[0],
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[ADMIN_BOOTSTRAP_ERROR]", {
      ip,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Failed to create admin" } },
      { status: 500 },
    );
  }
}
