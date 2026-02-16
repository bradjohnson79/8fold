import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { disputeAlertTypeEnum } from "./enums";

export const disputeAlerts = dbSchema.table("dispute_alerts", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  disputeCaseId: text("disputeCaseId").notNull(),
  type: disputeAlertTypeEnum("type").notNull(),
  handledAt: timestamp("handledAt", { mode: "date" }),
});

