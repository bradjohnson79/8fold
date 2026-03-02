import { doublePrecision, index, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { users } from "./user";

export const aiEnforcementEvents = dbSchema.table(
  "ai_enforcement_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id"),
    conversationId: text("conversation_id"),
    category: text("category").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    severity: integer("severity").notNull(),
    evidenceExcerpt: text("evidence_excerpt"),
    contextSummary: text("context_summary"),
    actionTaken: text("action_taken").notNull().default("NONE"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("ai_enforcement_events_user_idx").on(t.userId),
    convoIdx: index("ai_enforcement_events_convo_idx").on(t.conversationId),
    jobIdx: index("ai_enforcement_events_job_idx").on(t.jobId),
  }),
);
