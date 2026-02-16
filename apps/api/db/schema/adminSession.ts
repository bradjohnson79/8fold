import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Admin auth sessions for apps/admin (separate from public "sid" sessions).
// NOTE: In dev we may create this table at runtime from the login route.
export const adminSessions = dbSchema.table("admin_sessions", {
  id: text("id").primaryKey(),
  adminUserId: uuid("adminUserId").notNull(),
  sessionTokenHash: text("sessionTokenHash").notNull().unique(),
  expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

