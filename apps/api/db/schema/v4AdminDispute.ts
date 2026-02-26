import { index, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4AdminDisputes = dbSchema.table(
  "v4_admin_disputes",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id").notNull(),
    jobId: text("job_id").notNull(),
    filedByUserId: text("filed_by_user_id").notNull(),
    againstUserId: text("against_user_id").notNull(),
    againstRole: text("against_role").notNull(),
    disputeReason: text("dispute_reason").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull(),
    decision: text("decision"),
    decisionSummary: text("decision_summary"),
    decisionAt: timestamp("decision_at", { withTimezone: true, mode: "date" }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true, mode: "date" }).notNull(),
    ticketSubject: text("ticket_subject"),
    ticketPriority: text("ticket_priority"),
    ticketCategory: text("ticket_category"),
    ticketStatus: text("ticket_status"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => ({
    statusIdx: index("v4_admin_disputes_status_idx").on(t.status),
    createdAtIdx: index("v4_admin_disputes_created_at_idx").on(t.createdAt),
    jobIdx: index("v4_admin_disputes_job_idx").on(t.jobId),
  }),
);
