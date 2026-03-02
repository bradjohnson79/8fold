import { index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { v4MessageThreads } from "./v4MessageThread";

export const v4MessengerAppointments = dbSchema.table(
  "v4_messenger_appointments",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => v4MessageThreads.id, { onDelete: "cascade" }),
    scheduledAtUTC: timestamp("scheduled_at_utc", { mode: "date" }).notNull(),
    status: text("status").notNull().default("SCHEDULED"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    threadUniq: uniqueIndex("v4_messenger_appointments_thread_uniq").on(t.threadId),
    statusIdx: index("v4_messenger_appointments_status_idx").on(t.status),
    scheduledIdx: index("v4_messenger_appointments_scheduled_idx").on(t.scheduledAtUTC),
  }),
);
