import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { db } from "@/server/db/drizzle";
import { lgsWorkerHealth } from "@/db/schema/directoryEngine";
import { eq } from "drizzle-orm";
import { sessionCookieFor } from "@/src/lib/auth/adminSessionAuth";

const LGS_SESSION_COOKIE = "lgs_session";
const AUTH_WORKER_NAME = "lgs_auth";

async function verifyPassword(provided: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ configCheckResult: lgsWorkerHealth.configCheckResult })
      .from(lgsWorkerHealth)
      .where(eq(lgsWorkerHealth.workerName, AUTH_WORKER_NAME))
      .limit(1);

    const config = row?.configCheckResult as Record<string, string> | null;
    if (config?.password_hash) {
      return bcrypt.compare(provided, config.password_hash);
    }
  } catch {
    // DB unavailable — fall through to env var
  }

  const envPassword = String(process.env.LGS_AUTH_PASSWORD ?? "").trim();
  return !!envPassword && provided === envPassword;
}

type AttemptBucket = { count: number; resetAt: number };
const loginAttemptsByIp = new Map<string, AttemptBucket>();

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

    const payload = (await req.json().catch(() => null)) as { password?: string } | null;
    const password = String(payload?.password ?? "").trim();

    if (!password) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: "Password is required" } },
        { status: 400 },
      );
    }

    const jwtSecret = String(process.env.ADMIN_JWT_SECRET ?? "").trim();
    if (!jwtSecret) {
      console.error("[LGS_AUTH_LOGIN_ERROR] ADMIN_JWT_SECRET not configured");
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL_ERROR", message: "Auth not configured" } },
        { status: 500 },
      );
    }

    const passwordOk = await verifyPassword(password);
    if (!passwordOk) {
      console.warn("[LGS_AUTH_LOGIN_FAILED]", { reason: "wrong_password", ip });
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid password" } },
        { status: 401 },
      );
    }

    const token = jwt.sign({ role: "LGS_OPERATOR" }, jwtSecret, {
      expiresIn: "8h",
      algorithm: "HS256",
    });

    const res = NextResponse.json({ ok: true, data: { authenticated: true } }, { status: 200 });
    res.headers.set("set-cookie", sessionCookieFor(LGS_SESSION_COOKIE, token));
    return res;
  } catch (error) {
    console.error("[LGS_AUTH_LOGIN_ERROR]", {
      ip,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Login failed" } },
      { status: 500 },
    );
  }
}
