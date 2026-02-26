import { index, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4AdminTransfers = dbSchema.table(
  "v4_admin_transfers",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull(),
    role: text("role").notNull(),
    userId: text("user_id").notNull(),
    userEmail: text("user_email"),
    userName: text("user_name"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    method: text("method").notNull(),
    stripeTransferId: text("stripe_transfer_id"),
    externalRef: text("external_ref"),
    status: text("status").notNull(),
    failureReason: text("failure_reason"),
    jobTitle: text("job_title"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    statusIdx: index("v4_admin_transfers_status_idx").on(t.status),
    createdAtIdx: index("v4_admin_transfers_created_at_idx").on(t.createdAt),
    userIdx: index("v4_admin_transfers_user_idx").on(t.userId),
  }),
);
