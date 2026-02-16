import { index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Messaging: job-bound conversation between one contractor + one job poster.
export const conversations = dbSchema.table(
  "conversations",
  {
    id: text("id").primaryKey(),

    jobId: text("jobId").notNull(),
    contractorUserId: text("contractorUserId").notNull(),
    jobPosterUserId: text("jobPosterUserId").notNull(),

    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    jobIdIdx: index("conversations_jobId_idx").on(t.jobId),
    participantsIdx: index("conversations_participants_idx").on(t.contractorUserId, t.jobPosterUserId),
    uniq: uniqueIndex("conversations_job_participants_uniq").on(t.jobId, t.contractorUserId, t.jobPosterUserId),
  }),
);

