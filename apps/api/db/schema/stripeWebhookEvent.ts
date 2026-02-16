import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `StripeWebhookEvent` table (read/write; used for idempotency).
export const stripeWebhookEvents = dbSchema.table("StripeWebhookEvent", {
  id: text("id").primaryKey(), // Stripe Event ID (evt_*)
  type: text("type").notNull(),
  objectId: text("objectId"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  processedAt: timestamp("processedAt", { mode: "date" }),
});

