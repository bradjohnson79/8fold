import { boolean, index, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4NotificationDeliveryLogs = dbSchema.table(
  "v4_notification_delivery_logs",
  {
    id: text("id").primaryKey(),

    // Soft reference to v4_notifications.id (may be null for test sends)
    notificationId: text("notification_id"),

    notificationType: text("notification_type").notNull(),
    recipientUserId: text("recipient_user_id").notNull(),

    // Populated only when channel = EMAIL
    recipientEmail: text("recipient_email"),

    // EMAIL | IN_APP
    channel: text("channel").notNull(),

    // DELIVERED | FAILED | SKIPPED
    status: text("status").notNull(),

    errorMessage: text("error_message"),

    // Outbox event ID — enables tracing one domain event across multiple notification rows
    eventId: text("event_id"),

    // Mirrors the dedupeKey from the notification for exact per-recipient tracing
    dedupeKey: text("dedupe_key"),

    // True for sends originating from admin test panel — never pollutes real feeds
    isTest: boolean("is_test").notNull().default(false),

    // Extra context: template vars used, attempt number, etc.
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    recipientCreatedIdx: index("v4_notif_delivery_recipient_created_idx").on(t.recipientUserId, t.createdAt),
    typeStatusIdx: index("v4_notif_delivery_type_status_idx").on(t.notificationType, t.status),
    isTestCreatedIdx: index("v4_notif_delivery_is_test_created_idx").on(t.isTest, t.createdAt),
    createdIdx: index("v4_notif_delivery_created_idx").on(t.createdAt),
    channelStatusIdx: index("v4_notif_delivery_channel_status_idx").on(t.channel, t.status),
  }),
);
