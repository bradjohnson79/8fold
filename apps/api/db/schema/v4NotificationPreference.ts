import { index, text, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4NotificationPreferences = dbSchema.table(
  "v4_notification_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    notificationType: text("notification_type").notNull(),
    inApp: boolean("in_app").notNull().default(true),
    email: boolean("email").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userRoleIdx: index("v4_notification_preferences_user_role_idx").on(t.userId, t.role),
    userRoleTypeUq: uniqueIndex("v4_notification_preferences_user_role_type_uq").on(
      t.userId,
      t.role,
      t.notificationType,
    ),
  }),
);
