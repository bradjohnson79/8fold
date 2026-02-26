import { index, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4Notifications = dbSchema.table(
  "v4_notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    jobId: text("job_id"),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    readAt: timestamp("read_at", { mode: "date" }),
  },
  (t) => ({
    userCreatedIdx: index("v4_notifications_user_created_idx").on(t.userId, t.createdAt),
    userReadIdx: index("v4_notifications_user_read_idx").on(t.userId, t.readAt),
    jobTypeIdx: index("v4_notifications_job_type_idx").on(t.jobId, t.type),
  }),
);
