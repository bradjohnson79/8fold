import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { users } from "@/db/schema/user";
import { verifyLoginCode } from "@/src/auth/mobileAuth";
import { readJsonBody } from "@/src/lib/api/readJsonBody";
import { logEvent } from "@/src/server/observability/log";

// WARNING: ADMIN BOOTSTRAP ROUTE
// Remove or disable in production once real admin invite system exists.

const BodySchema = z.object({
  email: z.string().trim().email(),
  otpCode: z.string().trim().min(4),
  secret: z.string().trim().min(8),
});

type RateState = { hits: number; resetAtMs: number };
const RATE: Map<string, RateState> = new Map();
function ipFromReq(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = RATE.get(key);
  if (!cur || cur.resetAtMs <= now) {
    RATE.set(key, { hits: 1, resetAtMs: now + windowMs });
    return true;
  }
  if (cur.hits >= limit) return false;
  cur.hits++;
  return true;
}

export async function POST(req: Request) {
  try {
    const ip = ipFromReq(req);
    const j = await readJsonBody(req);
    if (!j.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const parsed = BodySchema.safeParse(j.json);
    if (!parsed.success) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { email, otpCode, secret } = parsed.data;
    const expected = process.env.ADMIN_SIGNUP_SECRET ?? "";
    if (!expected || secret !== expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // Basic memory throttle: 5 attempts / minute per IP+email.
    const rlKey = `${ip}:${email.toLowerCase()}`;
    if (!rateLimit(rlKey, 5, 60_000)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // Verify OTP using the existing auth flow. Never leak details.
    let result: any;
    try {
      result = await verifyLoginCode(otpCode);
    } catch (e) {
      logEvent({
        level: "warn",
        event: "admin.bootstrap_otp_failed",
        route: "/api/bootstrap-admin",
        method: "POST",
        status: 401,
        code: "AUTH_FAILED",
      });
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const authedEmail = String(result?.user?.email ?? "").trim().toLowerCase();
    if (!authedEmail || authedEmail !== email.trim().toLowerCase()) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const userId = String(result?.user?.id ?? "").trim();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // Role immutability: this route must not elevate roles. Admin must be provisioned by
    // creating a separate Clerk account and setting the internal role at user creation time.
    const rows = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    const role = String(rows[0]?.role ?? "").toUpperCase();
    if (role !== "ADMIN") {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "ROLE_IMMUTABLE", message: "Role selection is permanent and cannot be changed." },
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, data: { role: "ADMIN" } });
  } catch (err) {
    logEvent({
      level: "error",
      event: "admin.bootstrap_error",
      route: "/api/bootstrap-admin",
      method: "POST",
      status: 401,
      code: "UNAUTHORIZED",
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}

