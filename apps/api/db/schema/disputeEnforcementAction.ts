import { jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { disputeEnforcementActionStatusEnum, disputeEnforcementActionTypeEnum } from "./enums";

export const disputeEnforcementActions = dbSchema.table("dispute_enforcement_actions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  disputeCaseId: text("disputeCaseId").notNull(),
  type: disputeEnforcementActionTypeEnum("type").notNull(),
  status: disputeEnforcementActionStatusEnum("status").notNull().default("PENDING"),
  payload: jsonb("payload"),

  requestedByUserId: text("requestedByUserId").notNull(),
  executedByUserId: text("executedByUserId"),
  executedAt: timestamp("executedAt", { mode: "date" }),
  error: text("error"),
});

