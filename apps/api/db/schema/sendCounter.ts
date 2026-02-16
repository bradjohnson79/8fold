import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `SendCounter` model (@@map("send_counters")).
// Used for rate limiting and warmup logic.
export const sendCounters = dbSchema.table("send_counters", {
  id: text("id").primaryKey(),

  emailIdentityId: text("emailIdentityId").notNull(),
  date: timestamp("date", { mode: "date" }).notNull(),

  sentToday: integer("sentToday").notNull().default(0),
  sentLast3Hours: integer("sentLast3Hours").notNull().default(0),
  lastSentAt: timestamp("lastSentAt", { mode: "date" }),

  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

