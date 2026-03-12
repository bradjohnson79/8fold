import { boolean, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const waitlistSubscribers = dbSchema.table("waitlist_subscribers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  // "router" | "job_poster"
  roleType: text("role_type").notNull(),
  // Supports future double-opt-in flow without a schema change
  isConfirmed: boolean("is_confirmed").notNull().default(false),
  // Marketing attribution: "homepage" | "router_page" | "ads" | "facebook" | "craigslist"
  source: text("source").default("homepage"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
