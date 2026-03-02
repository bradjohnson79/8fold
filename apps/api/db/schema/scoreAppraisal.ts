import { doublePrecision, index, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { users } from "./user";

export const scoreAppraisals = dbSchema.table(
  "score_appraisals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    jobsEvaluated: integer("jobs_evaluated").notNull().default(0),
    avgPunctuality: doublePrecision("avg_punctuality"),
    avgCommunication: doublePrecision("avg_communication"),
    avgQuality: doublePrecision("avg_quality"),
    avgCooperation: doublePrecision("avg_cooperation"),
    totalScore: doublePrecision("total_score"),
    promptHash: text("prompt_hash"),
    version: text("version").notNull().default("v1"),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userRoleUniq: uniqueIndex("score_appraisals_user_role_uniq").on(t.userId, t.role),
    scoreIdx: index("score_appraisals_score_idx").on(t.totalScore),
  }),
);
