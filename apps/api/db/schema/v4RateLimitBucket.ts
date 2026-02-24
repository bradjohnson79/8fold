import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4RateLimitBuckets = dbSchema.table("v4_rate_limit_buckets", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
  count: integer("count").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
