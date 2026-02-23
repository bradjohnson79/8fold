import { jsonb, pgEnum, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const jobDraftStatusEnum = pgEnum("JobDraftStatus", ["ACTIVE", "ARCHIVED"]);
export const jobDraftStepEnum = pgEnum("JobDraftStep", [
  "DETAILS",
  "PRICING",
  "AVAILABILITY",
  "PAYMENT",
  "CONFIRMED",
]);

export const jobDraft = pgTable(
  "JobDraft",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId").notNull(),
    status: jobDraftStatusEnum("status").notNull().default("ACTIVE"),
    step: jobDraftStepEnum("step").notNull().default("DETAILS"),
    data: jsonb("data").notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    oneActivePerUser: uniqueIndex("JobDraft_v3_one_active_per_user")
      .on(t.userId)
      .where(sql`"status" = 'ACTIVE'`),
  })
);
