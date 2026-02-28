import { boolean, index, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    read: boolean("read").notNull().default(false),
    readAt: timestamp("read_at", { mode: "date" }),
    priority: text("priority").notNull().default("NORMAL"),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("v4_notifications_user_idx").on(t.userId),
    userRoleCreatedIdx: index("v4_notifications_user_role_created_idx").on(t.userId, t.role, t.createdAt),
    readIdx: index("v4_notifications_read_idx").on(t.read),
    readAtIdx: index("v4_notifications_read_at_idx").on(t.readAt),
    priorityIdx: index("v4_notifications_priority_idx").on(t.priority),
    createdIdx: index("v4_notifications_created_idx").on(t.createdAt),
    dedupeKeyIdx: uniqueIndex("v4_notifications_dedupe_key_uq").on(t.dedupeKey),
  }),
);
