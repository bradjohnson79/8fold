import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Contractor Launch List — for visitors who want updates without creating a full account.
// Separate from contractor_accounts and the users table; no auth credentials are created.
export const contractorLaunchList = dbSchema.table("contractor_launch_list", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
