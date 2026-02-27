import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const admins = dbSchema.table("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("STANDARD"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  disabledAt: timestamp("disabled_at", { mode: "date" }),
});
