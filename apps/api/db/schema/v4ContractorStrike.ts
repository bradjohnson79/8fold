import { index, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { users } from "./user";

export const v4ContractorStrikes = dbSchema.table(
  "v4_contractor_strikes",
  {
    id: text("id").primaryKey(),
    contractorUserId: text("contractor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    contractorIdx: index("v4_contractor_strikes_contractor_idx").on(t.contractorUserId),
  })
);
