import { boolean, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dbSchema } from "./_dbSchema";
import { jobs } from "./job";
import { users } from "./user";

// Public job reporting -> admin oversight (non-destructive).
export const jobFlags = dbSchema.table("JobFlag", {
  id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
  jobId: text("jobId")
    .notNull()
    .references(() => jobs.id),
  userId: text("userId").references(() => users.id),
  reason: text("reason").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
});

