import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import {
  disputeAgainstRoleEnum,
  disputeDecisionEnum,
  disputeReasonEnum,
  disputeStatusEnum,
} from "./enums";

// Mirrors Prisma `DisputeCase` table (support disputes).
export const disputeCases = dbSchema.table("dispute_cases", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  ticketId: text("ticketId").notNull(),

  jobId: text("jobId").notNull(),
  filedByUserId: text("filedByUserId").notNull(),
  againstUserId: text("againstUserId").notNull(),

  againstRole: disputeAgainstRoleEnum("againstRole").notNull(),
  disputeReason: disputeReasonEnum("disputeReason").notNull(),
  description: text("description").notNull(),

  status: disputeStatusEnum("status").notNull().default("SUBMITTED"),
  decision: disputeDecisionEnum("decision"),
  decisionSummary: text("decisionSummary"),
  decisionAt: timestamp("decisionAt", { mode: "date" }),

  deadlineAt: timestamp("deadlineAt", { mode: "date" }).notNull(),
});

