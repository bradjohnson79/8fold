import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { v4RateLimitBuckets } from "@/db/schema/v4RateLimitBucket";
import { tooMany } from "@/src/services/v4/v4Errors";

type RateLimitInput = {
  key: string;
  windowSeconds: number;
  max: number;
  now?: Date;
};

export async function rateLimitOrThrow(input: RateLimitInput): Promise<void> {
  const now = input.now ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const windowStartSeconds = Math.floor(nowSeconds / input.windowSeconds) * input.windowSeconds;
  const windowStart = new Date(windowStartSeconds * 1000);

  const rows = await db
    .insert(v4RateLimitBuckets)
    .values({
      key: input.key,
      windowStart,
      count: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: v4RateLimitBuckets.key,
      set: {
        count: sql`CASE WHEN ${v4RateLimitBuckets.windowStart} = ${windowStart} THEN ${v4RateLimitBuckets.count} + 1 ELSE 1 END`,
        windowStart,
        updatedAt: now,
      },
    })
    .returning({
      count: v4RateLimitBuckets.count,
      windowStart: v4RateLimitBuckets.windowStart,
    });

  const bucket = rows[0];
  if (!bucket) return;
  if (bucket.count <= input.max) return;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.windowStart.getTime() + input.windowSeconds * 1000 - now.getTime()) / 1000),
  );
  throw tooMany("V4_RATE_LIMITED", "Too many requests", retryAfterSeconds);
}
