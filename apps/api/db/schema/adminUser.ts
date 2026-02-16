import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const adminUsers = dbSchema.table("AdminUser", {
  // DB authoritative: uuid NOT NULL default gen_random_uuid()
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  role: text("role").notNull().default("ADMIN"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // Profile (operational identity)
  fullName: text("fullName"),
  country: text("country"),
  state: text("state"),
  city: text("city"),
  address: text("address"),
});
