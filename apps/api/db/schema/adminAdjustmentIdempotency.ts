import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

/**
 * Idempotency store for admin finance adjustments.
 * Prevents duplicate ledger entries when the same request is retried.
 */
export const adminAdjustmentIdempotency = dbSchema.table("AdminAdjustmentIdempotency", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotencyKey").notNull().unique(),
  ledgerEntryId: uuid("ledgerEntryId").notNull(),
  createdByUserId: text("createdByUserId").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});
