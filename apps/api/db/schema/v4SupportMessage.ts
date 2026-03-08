import { index, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { v4SupportTickets } from "./v4SupportTicket";

export const v4SupportMessages = dbSchema.table(
  "v4_support_messages",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => v4SupportTickets.id, { onDelete: "cascade" }),
    senderUserId: text("sender_user_id").notNull(),
    senderRole: text("sender_role").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    ticketIdx: index("v4_support_messages_ticket_idx").on(t.ticketId),
    senderIdx: index("v4_support_messages_sender_idx").on(t.senderUserId),
  })
);
