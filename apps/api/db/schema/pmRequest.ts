import {
  index,
  numeric,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { pmRequestStatusEnum } from "./enums";
import { escrows } from "./escrow";
import { jobs } from "./job";

export const pmRequests = dbSchema.table(
  "PmRequest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: text("jobId")
      .notNull()
      .references(() => jobs.id),
    contractorId: text("contractorId").notNull(),
    jobPosterUserId: text("jobPosterUserId").notNull(),
    initiatedBy: text("initiatedBy").notNull(),
    status: pmRequestStatusEnum("status").notNull().default("DRAFT"),
    autoTotal: numeric("autoTotal", { precision: 12, scale: 2 }).notNull().default("0"),
    manualTotal: numeric("manualTotal", { precision: 12, scale: 2 }),
    approvedTotal: numeric("approvedTotal", { precision: 12, scale: 2 }),
    taxAmount: numeric("taxAmount", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    stripePaymentIntentId: text("stripePaymentIntentId"),
    escrowId: uuid("escrowId").references(() => escrows.id),
    amendReason: text("amendReason"),
    proposedBudget: numeric("proposedBudget", { precision: 12, scale: 2 }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("PmRequest_jobId_idx").on(t.jobId),
    index("PmRequest_status_idx").on(t.status),
  ]
);
