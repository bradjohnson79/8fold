import { index, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Messaging: plain-text messages within a conversation.
export const messages = dbSchema.table(
  "messages",
  {
    id: text("id").primaryKey(),

    conversationId: text("conversationId").notNull(),

    senderUserId: text("senderUserId").notNull(),
    // CONTRACTOR | JOB_POSTER | SYSTEM
    senderRole: text("senderRole").notNull(),

    body: text("body").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    convoCreatedIdx: index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
  }),
);

