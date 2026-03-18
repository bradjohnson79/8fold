import crypto from "crypto";
import { NextResponse } from "next/server";

const LGS_SESSION_COOKIE = "lgs_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

type AttemptBucket = { count: number; resetAt: number };
const loginAttemptsByIp = new Map<string, AttemptBucket>();

function consumeRateLimit(
  map: Map<string, AttemptBucket>,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
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

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = toBase64Url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = toBase64Url(Buffer.from(JSON.stringify(payload)));
  const sig = toBase64Url(
    crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${sig}`;
}

function sessionCookie(token: string): string {
  return `${LGS_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export async function POST(req: Request) {
  const ip = requestIp(req);

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

  const configuredPassword = String(process.env.LGS_AUTH_PASSWORD ?? "").trim();
  const jwtSecret = String(process.env.ADMIN_JWT_SECRET ?? "").trim();

  if (!configuredPassword || !jwtSecret) {
    console.error("[LGS_LOGIN] LGS_AUTH_PASSWORD or ADMIN_JWT_SECRET not configured");
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Auth not configured on this deployment" } },
      { status: 500 },
    );
  }

  if (password !== configuredPassword) {
    console.warn("[LGS_LOGIN_FAILED]", { reason: "wrong_password", ip });
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid password" } },
      { status: 401 },
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const token = signJwt(
    { role: "LGS_OPERATOR", iat: nowSeconds, exp: nowSeconds + SESSION_MAX_AGE_SECONDS },
    jwtSecret,
  );

  const res = NextResponse.json({ ok: true, data: { authenticated: true } }, { status: 200 });
  res.headers.set("set-cookie", sessionCookie(token));
  return res;
}
