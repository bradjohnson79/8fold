type Bucket = { count: number; resetAt: number };

// In-memory rate limiting (v1). For production multi-instance, replace with Redis.
const buckets = new Map<string, Bucket>();

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  const b = buckets.get(opts.key);
  if (!b || b.resetAt <= now) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }
  if (b.count >= opts.limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((b.resetAt - now) / 1000))
    };
  }
  b.count += 1;
  return { ok: true };
}

