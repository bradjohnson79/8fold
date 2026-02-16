import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, materialsRequestStatusEnum } from "./enums";

export const materialsRequests = dbSchema.table("MaterialsRequest", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  status: materialsRequestStatusEnum("status").notNull().default("SUBMITTED"),

  jobId: text("jobId").notNull(),
  contractorId: text("contractorId").notNull(),
  jobPosterUserId: text("jobPosterUserId").notNull(),
  routerUserId: text("routerUserId"),

  submittedAt: timestamp("submittedAt", { mode: "date" }).notNull().defaultNow(),
  approvedAt: timestamp("approvedAt", { mode: "date" }),
  declinedAt: timestamp("declinedAt", { mode: "date" }),
  approvedByUserId: text("approvedByUserId"),
  declinedByUserId: text("declinedByUserId"),

  currency: currencyCodeEnum("currency").notNull().default("USD"),
  totalAmountCents: integer("totalAmountCents").notNull(),
});

