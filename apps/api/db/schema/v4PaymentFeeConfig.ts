import { text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4PaymentFeeConfig = dbSchema.table(
  "v4_payment_fee_config",
  {
    id: text("id").primaryKey(),
    paymentMethod: text("payment_method").notNull(),
    percentBps: integer("percent_bps").notNull(),
    fixedCents: integer("fixed_cents").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    methodUq: uniqueIndex("v4_payment_fee_config_method_uq").on(t.paymentMethod),
  }),
);
