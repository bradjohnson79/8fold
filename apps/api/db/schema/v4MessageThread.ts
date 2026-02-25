import { index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { jobs } from "./job";
import { users } from "./user";

export const v4MessageThreads = dbSchema.table(
  "v4_message_threads",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    jobPosterUserId: text("job_poster_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contractorUserId: text("contractor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at", { mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    jobParticipantsUniq: uniqueIndex("v4_message_threads_job_participants_uniq").on(
      t.jobId,
      t.jobPosterUserId,
      t.contractorUserId
    ),
    jobPosterIdx: index("v4_message_threads_job_poster_idx").on(t.jobPosterUserId),
    contractorIdx: index("v4_message_threads_contractor_idx").on(t.contractorUserId),
  })
);
