import { index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { jobs } from "./job";
import { users } from "./user";

export const v4JobAssignments = dbSchema.table(
  "v4_job_assignments",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    contractorUserId: text("contractor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { mode: "date" }).notNull().defaultNow(),
    status: text("status").notNull().default("ASSIGNED"),
  },
  (t) => ({
    jobIdx: index("v4_job_assignments_job_idx").on(t.jobId),
    contractorIdx: index("v4_job_assignments_contractor_idx").on(t.contractorUserId),
    statusIdx: index("v4_job_assignments_status_idx").on(t.status),
    jobContractorUniq: uniqueIndex("v4_job_assignments_job_contractor_uniq").on(
      t.jobId,
      t.contractorUserId
    ),
  })
);
