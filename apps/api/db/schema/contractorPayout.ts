import { integer, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { pmRequests } from "./pmRequest";
import { contractorPayoutStatusEnum } from "./enums";

export const contractorPayouts = dbSchema.table(
  "ContractorPayout",
  {
    id: text("id").primaryKey(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

    contractorId: text("contractorId").notNull(),
    jobId: text("jobId"),
    materialsRequestId: text("materialsRequestId"),
    pmRequestId: uuid("pmRequestId").references(() => pmRequests.id),

    amountCents: integer("amountCents").notNull(),
    scheduledFor: timestamp("scheduledFor", { mode: "date" }).notNull(),

    status: contractorPayoutStatusEnum("status").notNull().default("PENDING"),
    paidAt: timestamp("paidAt", { mode: "date" }),
    externalReference: text("externalReference"),
    failureReason: text("failureReason"),
  },
  (t) => [
    uniqueIndex("ContractorPayout_pmRequestId_uq").on(t.pmRequestId),
  ],
);

