import { boolean, index, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4NotificationTemplates = dbSchema.table(
  "v4_notification_templates",
  {
    id: text("id").primaryKey(),

    // One of the 42 NOTIFICATION_TYPES values — uniquely identifies this template
    notificationType: text("notification_type").notNull(),

    // Grouping label shown in admin UI (Job Lifecycle, Messaging, Financial, etc.)
    category: text("category").notNull().default("System"),

    // Email channel
    emailSubject: text("email_subject"),
    emailTemplate: text("email_template"),

    // In-app notification short text
    inAppTemplate: text("in_app_template"),

    // Per-instance toggles: admin can disable a channel for this type
    enabledEmail: boolean("enabled_email").notNull().default(true),
    enabledInApp: boolean("enabled_in_app").notNull().default(true),

    // Whether this notification type logically supports each channel at all
    // (admin UI hides the channel editor when false)
    supportsEmail: boolean("supports_email").notNull().default(true),
    supportsInApp: boolean("supports_in_app").notNull().default(true),

    // Documents supported {{var}} tokens for this type — shown in admin UI variable reference
    variables: jsonb("variables").$type<string[]>(),

    updatedAt: timestamp("updated_at", { mode: "date" }),
    updatedBy: text("updated_by"),
  },
  (t) => ({
    notificationTypeUq: uniqueIndex("v4_notification_templates_type_uq").on(t.notificationType),
    categoryIdx: index("v4_notification_templates_category_idx").on(t.category),
  }),
);
