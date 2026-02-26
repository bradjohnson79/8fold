import { index, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { jobs } from "./job";
import { users } from "./user";

export const v4ContractorJobInviteStatusEnum = ["PENDING", "ACCEPTED", "REJECTED"] as const;

export const v4ContractorJobInvites = dbSchema.table(
  "v4_contractor_job_invites",
  {
    id: text("id").primaryKey(),
    routeId: text("route_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    contractorUserId: text("contractor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    jobIdx: index("v4_contractor_job_invites_job_idx").on(t.jobId),
    contractorIdx: index("v4_contractor_job_invites_contractor_idx").on(t.contractorUserId),
    statusIdx: index("v4_contractor_job_invites_status_idx").on(t.status),
  })
);
