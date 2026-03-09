import { boolean, index, integer, timestamp, text, unique } from "drizzle-orm/pg-core";
import { tradeCategoryEnum } from "./enums";
import { dbSchema } from "./_dbSchema";
import { users } from "./user";

export const v4ContractorTradeSkills = dbSchema.table(
  "v4_contractor_trade_skills",
  {
    id: text("id").primaryKey(),

    contractorUserId: text("contractor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // pgEnum enforces canonical uppercase values — no UPPER/TRIM normalization needed in queries
    tradeCategory: tradeCategoryEnum("trade_category").notNull(),

    yearsExperience: integer("years_experience").notNull(),

    // approved = yearsExperience >= 3 — set by backend service on every upsert
    approved: boolean("approved").notNull().default(false),

    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    // Each contractor can declare each trade at most once
    uniqueUserTrade: unique().on(t.contractorUserId, t.tradeCategory),
    // Composite index for fast router matching: find all approved contractors for a given trade
    tradeLookup: index("trade_skill_lookup_idx").on(t.tradeCategory, t.approved),
  }),
);
