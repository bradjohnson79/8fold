import { integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { partsMaterialReleaseStatusEnum, partsMaterialStatusEnum, paymentStatusEnum } from "./enums";
import { contractors } from "./contractor";
import { jobs } from "./job";
import { escrows } from "./escrow";

export const partsMaterialRequests = dbSchema.table("PartsMaterialRequest", {
  id: uuid("id").primaryKey().defaultRandom(),

  jobId: text("jobId")
    .notNull()
    .references(() => jobs.id),
  contractorId: text("contractorId")
    .notNull()
    .references(() => contractors.id),

  amountCents: integer("amountCents").notNull(),
  currency: text("currency").notNull().default("cad"),
  description: text("description").notNull(),

  status: partsMaterialStatusEnum("status").notNull(),
  paymentStatus: paymentStatusEnum("paymentStatus").notNull().default("UNPAID"),
  stripePaymentIntentId: text("stripePaymentIntentId"),
  fundedAt: timestamp("fundedAt", { mode: "date" }),
  releaseStatus: partsMaterialReleaseStatusEnum("releaseStatus").notNull().default("NOT_READY"),
  contractorTransferId: text("contractorTransferId"),
  escrowId: uuid("escrowId").references(() => escrows.id),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

