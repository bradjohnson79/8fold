import { index, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Notifications: one-way system/admin → user deliveries (one row per recipient).
export const notificationDeliveries = dbSchema.table(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),

    userId: text("userId").notNull(),

    title: text("title").notNull(),
    body: text("body"),

    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    readAt: timestamp("readAt", { mode: "date" }),

    createdByAdminUserId: text("createdByAdminUserId"),
    jobId: text("jobId"),
  },
  (t) => ({
    userCreatedIdx: index("notification_deliveries_user_created_idx").on(t.userId, t.createdAt),
    userReadIdx: index("notification_deliveries_user_read_idx").on(t.userId, t.readAt),
  }),
);

