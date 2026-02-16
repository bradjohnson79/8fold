import { NextResponse } from "next/server";
import { incCounter } from "./observability/metrics";
import { logEvent } from "./observability/log";

type Bucket = { count: number; resetAtMs: number };

const BUCKETS = new Map<string, Bucket>();

function nowMs() {
  return Date.now();
}

function getIp(req: Request): string {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]?.trim() || "unknown";
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export function rateLimitJson(req: Request, opts: { key: string; limit: number; windowMs: number }): NextResponse | null {
  const key = `${opts.key}:${getIp(req)}`;
  const t = nowMs();
  const existing = BUCKETS.get(key);
  if (!existing || existing.resetAtMs <= t) {
    BUCKETS.set(key, { count: 1, resetAtMs: t + opts.windowMs });
    return null;
  }

  existing.count += 1;
  if (existing.count <= opts.limit) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAtMs - t) / 1000));
  const route = (() => {
    try {
      return new URL(req.url).pathname;
    } catch {
      return undefined;
    }
  })();
  incCounter("auth_rate_limited_total", { key: opts.key, route });
  logEvent({
    level: "warn",
    event: "auth.rate_limited",
    route,
    method: req.method,
    status: 429,
    code: "RATE_LIMITED",
    context: { retryAfterSeconds, key: opts.key },
  });
  return NextResponse.json(
    {
      ok: false,
      error: "Too Many Requests",
      code: "RATE_LIMITED",
      context: { retryAfterSeconds },
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

export function authRateLimitConfig(): { request: { limit: number; windowMs: number }; verify: { limit: number; windowMs: number } } {
  const prod = process.env.NODE_ENV === "production";
  // Dev: permissive. Prod: tight.
  return {
    request: prod ? { limit: 8, windowMs: 60_000 } : { limit: 200, windowMs: 60_000 },
    verify: prod ? { limit: 20, windowMs: 60_000 } : { limit: 400, windowMs: 60_000 },
  };
}

