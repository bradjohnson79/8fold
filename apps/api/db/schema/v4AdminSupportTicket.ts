import { index, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4AdminSupportTickets = dbSchema.table(
  "v4_admin_support_tickets",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    category: text("category").notNull(),
    priority: text("priority").notNull(),
    roleContext: text("role_context").notNull(),
    subject: text("subject").notNull(),
    createdById: text("created_by_id").notNull(),
    assignedToId: text("assigned_to_id"),
    messageCount: integer("message_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => ({
    statusIdx: index("v4_admin_support_tickets_status_idx").on(t.status),
    createdAtIdx: index("v4_admin_support_tickets_created_at_idx").on(t.createdAt),
    priorityIdx: index("v4_admin_support_tickets_priority_idx").on(t.priority),
  }),
);
