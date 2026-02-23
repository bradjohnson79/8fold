import { jsonb, pgEnum, pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";

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
    userIdStatusIdx: index("JobDraft_userId_status_idx").on(t.userId, t.status),
  })
);
