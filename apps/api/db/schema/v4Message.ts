import { index, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { jobs } from "./job";
import { users } from "./user";
import { v4MessageThreads } from "./v4MessageThread";

export const v4Messages = dbSchema.table(
  "v4_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").references(() => v4MessageThreads.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id").references(() => users.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id").references(() => users.id, { onDelete: "cascade" }),
    senderRole: text("sender_role").notNull().default("SYSTEM"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    readAt: timestamp("read_at", { mode: "date" }),
  },
  (t) => ({
    jobIdx: index("v4_messages_job_idx").on(t.jobId),
    threadIdx: index("v4_messages_thread_idx").on(t.threadId),
    fromToIdx: index("v4_messages_from_to_idx").on(t.fromUserId, t.toUserId),
    senderRoleIdx: index("v4_messages_sender_role_idx").on(t.senderRole),
  })
);
