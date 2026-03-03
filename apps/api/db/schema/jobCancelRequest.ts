import { index, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dbSchema } from "./_dbSchema";
import { jobRequestStatusEnum } from "./enums";

export const jobCancelRequests = dbSchema.table(
  "job_cancel_requests",
  {
    id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
    jobId: text("job_id").notNull(),
    jobPosterId: text("job_poster_id").notNull(),
    reason: text("reason").notNull(),
    status: jobRequestStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    reviewedByAdminId: text("reviewed_by_admin_id"),
  },
  (t) => ({
    jobIdIdx: index("job_cancel_requests_job_id_idx").on(t.jobId),
    jobPosterIdIdx: index("job_cancel_requests_job_poster_id_idx").on(t.jobPosterId),
    statusIdx: index("job_cancel_requests_status_idx").on(t.status),
    createdAtIdx: index("job_cancel_requests_created_at_idx").on(t.createdAt),
  }),
);
