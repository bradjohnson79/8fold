import { index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4AdminBootstrapTokens = dbSchema.table(
  "v4_admin_bootstrap_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashIdx: index("v4_admin_bootstrap_tokens_hash_idx").on(t.tokenHash),
    expiresIdx: index("v4_admin_bootstrap_tokens_expires_idx").on(t.expiresAt),
  }),
);
