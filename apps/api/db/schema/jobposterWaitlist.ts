import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const jobposterWaitlist = dbSchema.table("jobposter_waitlist", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
