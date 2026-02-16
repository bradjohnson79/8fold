import { integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, escrowKindEnum, escrowStatusEnum } from "./enums";
import { jobs } from "./job";

export const escrows = dbSchema.table("Escrow", {
  id: uuid("id").primaryKey().defaultRandom(),

  jobId: text("jobId")
    .notNull()
    .references(() => jobs.id),

  kind: escrowKindEnum("kind").notNull(),
  amountCents: integer("amountCents").notNull(),
  currency: currencyCodeEnum("currency").notNull(),

  status: escrowStatusEnum("status").notNull().default("PENDING"),

  stripeCheckoutSessionId: text("stripeCheckoutSessionId").unique(),
  stripePaymentIntentId: text("stripePaymentIntentId").unique(),
  webhookProcessedAt: timestamp("webhookProcessedAt", { mode: "date" }),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

