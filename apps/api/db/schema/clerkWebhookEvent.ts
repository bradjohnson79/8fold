import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Clerk webhook replay protection. Stores processed Clerk webhook `event.id`.
export const clerkWebhookEvents = dbSchema.table("clerk_webhook_events", {
  eventId: text("eventId").primaryKey(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});
