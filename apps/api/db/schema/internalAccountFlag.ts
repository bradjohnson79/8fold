import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { internalAccountFlagTypeEnum } from "./enums";

export const internalAccountFlags = dbSchema.table("internal_account_flags", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  userId: text("userId").notNull(),
  type: internalAccountFlagTypeEnum("type").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  reason: text("reason").notNull(),

  disputeCaseId: text("disputeCaseId"),
  createdByUserId: text("createdByUserId").notNull(),

  resolvedAt: timestamp("resolvedAt", { mode: "date" }),
  resolvedByUserId: text("resolvedByUserId"),
});

