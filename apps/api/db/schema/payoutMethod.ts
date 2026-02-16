import { boolean, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, payoutProviderEnum } from "./enums";

export const payoutMethods = dbSchema.table("PayoutMethod", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  userId: text("userId").notNull(),

  currency: currencyCodeEnum("currency").notNull(),
  provider: payoutProviderEnum("provider").notNull(),

  isActive: boolean("isActive").notNull().default(true),
  details: jsonb("details").notNull(),
});

