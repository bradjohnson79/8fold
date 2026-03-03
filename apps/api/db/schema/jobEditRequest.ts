import { index, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dbSchema } from "./_dbSchema";
import { jobRequestStatusEnum } from "./enums";

export const jobEditRequests = dbSchema.table(
  "job_edit_requests",
  {
    id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
    jobId: text("job_id").notNull(),
    jobPosterId: text("job_poster_id").notNull(),
    originalTitle: text("original_title").notNull(),
    originalDescription: text("original_description").notNull(),
    requestedTitle: text("requested_title").notNull(),
    requestedDescription: text("requested_description").notNull(),
    status: jobRequestStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    reviewedByAdminId: text("reviewed_by_admin_id"),
  },
  (t) => ({
    jobIdIdx: index("job_edit_requests_job_id_idx").on(t.jobId),
    jobPosterIdIdx: index("job_edit_requests_job_poster_id_idx").on(t.jobPosterId),
    statusIdx: index("job_edit_requests_status_idx").on(t.status),
    createdAtIdx: index("job_edit_requests_created_at_idx").on(t.createdAt),
  }),
);
