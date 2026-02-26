import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4AdminSyncCheckpoints = dbSchema.table("v4_admin_sync_checkpoints", {
  key: text("key").primaryKey(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
