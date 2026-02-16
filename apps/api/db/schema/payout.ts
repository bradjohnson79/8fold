import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, payoutProviderEnum, payoutStatusEnum } from "./enums";

export const payouts = dbSchema.table("Payout", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  paidAt: timestamp("paidAt", { mode: "date" }),
  externalReference: text("externalReference"),
  notesInternal: text("notesInternal"),

  userId: text("userId"),
  status: payoutStatusEnum("status").notNull().default("PENDING"),

  currency: currencyCodeEnum("currency"),
  provider: payoutProviderEnum("provider"),
  amountCents: integer("amountCents"),

  scheduledFor: timestamp("scheduledFor", { mode: "date" }),
  failureReason: text("failureReason"),
});

