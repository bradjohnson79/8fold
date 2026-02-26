import { index, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4AdminPayoutRequests = dbSchema.table(
  "v4_admin_payout_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    userEmail: text("user_email"),
    userRole: text("user_role"),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull(),
    payoutId: text("payout_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => ({
    statusIdx: index("v4_admin_payout_requests_status_idx").on(t.status),
    createdAtIdx: index("v4_admin_payout_requests_created_at_idx").on(t.createdAt),
    userIdx: index("v4_admin_payout_requests_user_idx").on(t.userId),
  }),
);
