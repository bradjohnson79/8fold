import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `JobPayment` table (read-only mirror; used for Drizzle reads).
export const jobPayments = dbSchema.table("JobPayment", {
  id: text("id").primaryKey(),

  jobId: text("jobId"),

  stripePaymentIntentId: text("stripePaymentIntentId").notNull(),
  stripePaymentIntentStatus: text("stripePaymentIntentStatus").notNull(),
  stripeChargeId: text("stripeChargeId"),

  amountCents: integer("amountCents").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING, CAPTURED, FAILED, REFUNDED

  escrowLockedAt: timestamp("escrowLockedAt", { mode: "date" }),
  paymentCapturedAt: timestamp("paymentCapturedAt", { mode: "date" }),
  paymentReleasedAt: timestamp("paymentReleasedAt", { mode: "date" }),
  refundedAt: timestamp("refundedAt", { mode: "date" }),
  refundAmountCents: integer("refundAmountCents"),
  refundIssuedAt: timestamp("refundIssuedAt", { mode: "date" }),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),
});

