import { index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4AdminPayoutAdjustments = dbSchema.table(
  "v4_admin_payout_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: text("admin_id").notNull(),
    userId: text("user_id").notNull(),
    direction: text("direction").notNull(),
    bucket: text("bucket").notNull(),
    amountCents: integer("amount_cents").notNull(),
    memo: text("memo"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("v4_admin_payout_adjustments_user_idx").on(t.userId),
    createdAtIdx: index("v4_admin_payout_adjustments_created_at_idx").on(t.createdAt),
  }),
);
