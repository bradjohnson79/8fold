import { integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4EventOutbox = dbSchema.table("v4_event_outbox", {
  id: uuid("id").primaryKey(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { mode: "date", withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
});
