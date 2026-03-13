import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Launch opt-ins — simplified contractor waitlist for Phase 1 California launch.
// Separate from contractor_launch_list; used by homepage launch form.
export const launchOptIns = dbSchema.table("launch_opt_ins", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text("first_name").notNull(),
  email: text("email").notNull().unique(),
  city: text("city"),
  state: text("state").notNull().default("California"),
  source: text("source").notNull().default("homepage_launch_list"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
