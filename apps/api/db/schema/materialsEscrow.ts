import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, materialsEscrowStatusEnum } from "./enums";

export const materialsEscrows = dbSchema.table("MaterialsEscrow", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  status: materialsEscrowStatusEnum("status").notNull().default("HELD"),
  requestId: text("requestId").notNull(),

  currency: currencyCodeEnum("currency").notNull().default("USD"),
  amountCents: integer("amountCents").notNull(),

  releaseDueAt: timestamp("releaseDueAt", { mode: "date" }),
  releasedAt: timestamp("releasedAt", { mode: "date" }),

  overageCents: integer("overageCents").notNull().default(0),
  posterCreditCents: integer("posterCreditCents").notNull().default(0),
  posterRefundCents: integer("posterRefundCents").notNull().default(0),
  receiptTotalCents: integer("receiptTotalCents").notNull().default(0),
  reimbursedAmountCents: integer("reimbursedAmountCents").notNull().default(0),
  remainderCents: integer("remainderCents").notNull().default(0),
});

