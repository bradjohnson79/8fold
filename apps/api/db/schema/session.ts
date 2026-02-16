import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Web-auth sessions table (legacy table name: "sessions").
// NOTE: This must be created via Drizzle SQL migrations (no runtime DDL).
export const sessions = dbSchema.table("sessions", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  role: text("role").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
});

