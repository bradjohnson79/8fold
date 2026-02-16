import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { materialsPaymentStatusEnum } from "./enums";

export const materialsPayments = dbSchema.table("MaterialsPayment", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  requestId: text("requestId").notNull(),

  stripePaymentIntentId: text("stripePaymentIntentId").notNull(),
  stripePaymentIntentStatus: text("stripePaymentIntentStatus").notNull().default("requires_payment_method"),
  stripeChargeId: text("stripeChargeId"),

  status: materialsPaymentStatusEnum("status").notNull().default("PENDING"),
  amountCents: integer("amountCents").notNull(),

  capturedAt: timestamp("capturedAt", { mode: "date" }),
  refundAmountCents: integer("refundAmountCents"),
  refundedAt: timestamp("refundedAt", { mode: "date" }),
  stripeRefundId: text("stripeRefundId"),
});

