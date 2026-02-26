import { timestamp, primaryKey, text } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { users } from "./user";

export const v4ContractorSuspensions = dbSchema.table(
  "v4_contractor_suspensions",
  {
    contractorUserId: text("contractor_user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    suspendedUntil: timestamp("suspended_until", { mode: "date" }).notNull(),
    reason: text("reason").notNull(),
  },
  () => ({})
);
