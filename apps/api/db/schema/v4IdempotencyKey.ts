import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4IdempotencyKeys = dbSchema.table("v4_idempotency_keys", {
  key: text("key").primaryKey(),
  userId: text("user_id").notNull(),
  requestHash: text("request_hash").notNull(),
  status: text("status").notNull(),
  jobId: text("job_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
