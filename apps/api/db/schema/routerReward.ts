import { index, integer, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

/**
 * Router referral rewards.
 *
 * NOTE: DB table must exist (see migration script).
 * Status is text with CHECK constraint in DB (PENDING|PAID).
 */
export const routerRewards = dbSchema.table(
  "RouterReward",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    routerUserId: text("routerUserId").notNull(),
    referredUserId: text("referredUserId").notNull(),
    jobId: text("jobId").notNull(),

    amount: integer("amount").notNull().default(500), // cents
    status: text("status").notNull().default("PENDING"),

    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    paidAt: timestamp("paidAt", { mode: "date" }),
  },
  (t) => ({
    routerUserIdIdx: index("router_rewards_router_user_id_idx").on(t.routerUserId),
    referredUserIdUnique: uniqueIndex("router_rewards_referred_user_id_unique").on(t.referredUserId),
  }),
);

