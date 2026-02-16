import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { contractorPayoutStatusEnum } from "./enums";

export const contractorPayouts = dbSchema.table("ContractorPayout", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  contractorId: text("contractorId").notNull(),
  jobId: text("jobId"),
  materialsRequestId: text("materialsRequestId"),

  amountCents: integer("amountCents").notNull(),
  scheduledFor: timestamp("scheduledFor", { mode: "date" }).notNull(),

  status: contractorPayoutStatusEnum("status").notNull().default("PENDING"),
  paidAt: timestamp("paidAt", { mode: "date" }),
  externalReference: text("externalReference"),
  failureReason: text("failureReason"),
});

