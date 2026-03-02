import { index, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { v4MessageThreads } from "./v4MessageThread";

export const v4CompletionReports = dbSchema.table(
  "v4_completion_reports",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => v4MessageThreads.id, { onDelete: "cascade" }),
    submittedByRole: text("submitted_by_role").notNull(),
    completedAtUTC: timestamp("completed_at_utc", { mode: "date" }).notNull(),
    summaryText: text("summary_text").notNull(),
    punctuality: integer("punctuality"),
    communication: integer("communication"),
    quality: integer("quality"),
    cooperation: integer("cooperation"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    threadRoleUniq: uniqueIndex("v4_completion_reports_thread_role_uniq").on(t.threadId, t.submittedByRole),
    threadIdx: index("v4_completion_reports_thread_idx").on(t.threadId),
  }),
);
