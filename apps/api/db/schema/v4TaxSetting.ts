import { boolean, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4TaxSettings = dbSchema.table("v4_tax_settings", {
  id: text("id").primaryKey(),
  taxMode: text("tax_mode").notNull().default("EXCLUSIVE"),
  autoApplyCanada: boolean("auto_apply_canada").notNull().default(true),
  applyToPlatformFee: boolean("apply_to_platform_fee").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
