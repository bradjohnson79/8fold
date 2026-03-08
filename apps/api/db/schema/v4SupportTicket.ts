import { index, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { users } from "./user";

export const v4SupportTickets = dbSchema.table(
  "v4_support_tickets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    subject: text("subject").notNull(),
    category: text("category").notNull(),
    ticketType: text("ticket_type"),
    priority: text("priority").notNull().default("NORMAL"),
    jobId: text("job_id"),
    body: text("body").notNull(),
    status: text("status").notNull().default("OPEN"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("v4_support_tickets_user_idx").on(t.userId),
    statusIdx: index("v4_support_tickets_status_idx").on(t.status),
  })
);
