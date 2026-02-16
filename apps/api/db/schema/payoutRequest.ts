import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { payoutRequestStatusEnum } from "./enums";

export const payoutRequests = dbSchema.table("PayoutRequest", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  status: payoutRequestStatusEnum("status").notNull().default("REQUESTED"),
  userId: text("userId").notNull(),
  amountCents: integer("amountCents").notNull(),
  payoutId: text("payoutId"),
});

