import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { monitoringActorRoleEnum, monitoringEventTypeEnum } from "./enums";

// Postgres table name is snake_case: monitoring_events
export const monitoringEvents = dbSchema.table("monitoring_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  type: monitoringEventTypeEnum("type").notNull(),
  jobId: text("jobId").notNull(),
  role: monitoringActorRoleEnum("role").notNull(),
  userId: text("userId"),
  handledAt: timestamp("handledAt", { mode: "date" }),
});

