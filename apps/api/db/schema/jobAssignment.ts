import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `JobAssignment` table (minimal fields for reads).
export const jobAssignments = dbSchema.table("JobAssignment", {
  id: text("id").primaryKey(),
  jobId: text("jobId").notNull(),
  contractorId: text("contractorId").notNull(),
  status: text("status").notNull(),
  assignedByAdminUserId: text("assignedByAdminUserId").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  completedAt: timestamp("completedAt", { mode: "date" }),
});

