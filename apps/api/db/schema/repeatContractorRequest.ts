import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { tradeCategoryEnum } from "./enums";

// Mirrors Prisma `RepeatContractorRequest` table (used across repeat-contractor + payment flows).
export const repeatContractorRequests = dbSchema.table("RepeatContractorRequest", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),

  jobId: text("jobId").notNull(),
  contractorId: text("contractorId").notNull(),
  tradeCategory: tradeCategoryEnum("tradeCategory").notNull(),
  status: text("status").notNull(), // REQUESTED, ACCEPTED, DECLINED, EXPIRED, CANCELLED
  requestedAt: timestamp("requestedAt", { mode: "date" }).notNull().defaultNow(),
  respondedAt: timestamp("respondedAt", { mode: "date" }),
  priorJobId: text("priorJobId"),
});

