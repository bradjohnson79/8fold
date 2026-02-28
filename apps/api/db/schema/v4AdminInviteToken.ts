import { index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4AdminInviteTokens = dbSchema.table(
  "v4_admin_invite_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    createdByAdminId: uuid("created_by_admin_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashIdx: index("v4_admin_invite_tokens_hash_idx").on(t.tokenHash),
    emailIdx: index("v4_admin_invite_tokens_email_idx").on(t.email),
    expiresIdx: index("v4_admin_invite_tokens_expires_idx").on(t.expiresAt),
  }),
);
