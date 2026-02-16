import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, jobHoldReasonEnum, jobHoldStatusEnum } from "./enums";

export const jobHolds = dbSchema.table("JobHold", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  status: jobHoldStatusEnum("status").notNull().default("ACTIVE"),
  jobId: text("jobId").notNull(),
  reason: jobHoldReasonEnum("reason").notNull(),

  notes: text("notes"),
  amountCents: integer("amountCents"),
  currency: currencyCodeEnum("currency"),

  appliedAt: timestamp("appliedAt", { mode: "date" }).notNull().defaultNow(),
  releasedAt: timestamp("releasedAt", { mode: "date" }),

  appliedByUserId: text("appliedByUserId"),
  appliedByAdminUserId: text("appliedByAdminUserId"), // uuid in DB (stored as text here)
  releasedByUserId: text("releasedByUserId"),
  releasedByAdminUserId: text("releasedByAdminUserId"), // uuid

  sourceDisputeCaseId: text("sourceDisputeCaseId"),
});

