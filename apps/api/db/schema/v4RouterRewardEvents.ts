import { index, integer, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dbSchema } from "./_dbSchema";

export const v4RouterRewardEvents = dbSchema.table(
  "v4_router_reward_events",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    routerUserId: text("router_user_id").notNull(),
    eventType: text("event_type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    jobId: text("job_id"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("idx_router_reward_events_user").on(t.routerUserId),
  }),
);
