import { index, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { jobs } from "./job";
import { users } from "./user";

export const v4ContractorAvailabilitySubmissions = dbSchema.table(
  "v4_contractor_availability_submissions",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    contractorUserId: text("contractor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    availabilityJson: jsonb("availability_json").notNull(),
    submittedAt: timestamp("submitted_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    jobIdx: index("v4_contractor_availability_job_idx").on(t.jobId),
    contractorIdx: index("v4_contractor_availability_contractor_idx").on(t.contractorUserId),
  })
);
