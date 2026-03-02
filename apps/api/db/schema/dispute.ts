import { index, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { users } from "./user";

export const disputes = dbSchema.table(
  "disputes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    jobId: text("job_id"),
    conversationId: text("conversation_id"),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull().default("OPEN"),
    attachmentPointers: jsonb("attachment_pointers"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("disputes_user_idx").on(t.userId),
    statusIdx: index("disputes_status_idx").on(t.status),
    conversationIdx: index("disputes_conversation_idx").on(t.conversationId),
    jobIdx: index("disputes_job_idx").on(t.jobId),
  }),
);
