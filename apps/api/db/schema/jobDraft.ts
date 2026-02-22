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
  "job_draft",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id").notNull(),
    status: jobDraftStatusEnum("status").notNull().default("ACTIVE"),
    step: jobDraftStepEnum("step").notNull().default("DETAILS"),
    data: jsonb("data").notNull().default({}),
    created_at: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdStatusIdx: index("job_draft_user_id_status_idx").on(t.user_id, t.status),
  })
);
