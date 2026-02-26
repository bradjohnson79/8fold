import { boolean, index, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4Notifications = dbSchema.table(
  "v4_notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("SYSTEM"),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    read: boolean("read").notNull().default(false),
    priority: text("priority").notNull().default("NORMAL"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("v4_notifications_user_idx").on(t.userId),
    readIdx: index("v4_notifications_read_idx").on(t.read),
    priorityIdx: index("v4_notifications_priority_idx").on(t.priority),
    createdIdx: index("v4_notifications_created_idx").on(t.createdAt),
  }),
);
